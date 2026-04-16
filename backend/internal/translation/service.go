package translation

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"log"
	"strings"
	"time"
)

var (
	ErrInvalidLang     = errors.New("invalid target language")
	ErrEmptySource     = errors.New("source text is empty")
	ErrNoProvider      = errors.New("no translation provider configured")
	ErrInsufficient    = errors.New("insufficient credits for translation")
	ErrTranslateFailed = errors.New("translation failed")
)

// LLM is the narrow interface translation needs from the platform LLM router.
// CompleteWithFeature labels each call so the admin cost panel can bucket
// spend by feature.
type LLM interface {
	Complete(ctx context.Context, provider, model, systemPrompt, userMessage string) (string, error)
	CompleteWithFeature(ctx context.Context, feature, provider, model, systemPrompt, userMessage string) (string, error)
}

// Wallet is the narrow interface translation needs from the credits service.
// Charge returns ErrInsufficient when the user can't afford it.
type Wallet interface {
	CountToday(userID int64, kind string) (int64, error)
	Charge(userID int64, amount int, kind, refType string, refID int64, note string) error
	RecordFreeUse(userID int64, refType string, refID int64, note string) error
}

// Config holds the live tunables read from site_settings each call.
type Config struct {
	DailyFreeTranslations int
	TranslationCost       int
	Provider              string
	Model                 string
}

// ConfigSource lets the service read live config without importing site.
type ConfigSource interface {
	GetTranslation() (Config, error)
}

type Service struct {
	repo   *Repository
	llm    LLM
	wallet Wallet
	cfg    ConfigSource
}

func NewService(repo *Repository, llm LLM, wallet Wallet, cfg ConfigSource) *Service {
	return &Service{repo: repo, llm: llm, wallet: wallet, cfg: cfg}
}

const KindTranslation = "translation"

var langLabels = map[string]string{
	"en": "English",
	"zh": "Simplified Chinese",
	"ja": "Japanese",
	"ko": "Korean",
}

// Result is what the handler sends back to the frontend.
type Result struct {
	Translated    string `json:"translated"`
	TargetLang    string `json:"target_lang"`
	Provider      string `json:"provider"`
	Model         string `json:"model"`
	LatencyMs     int    `json:"latency_ms"`
	Cached        bool   `json:"cached"`
	Charged       int    `json:"charged"`
	FreeRemaining int    `json:"free_remaining"`
}

// metaMarkers are English phrases reasoning models emit when they leak
// their chain-of-thought into the answer instead of just translating.
// Used by sanitizeTranslation to detect and strip the leaked reasoning.
var metaMarkers = []string{
	"let me translate",
	"i need to translate",
	"i'll translate",
	"i will translate",
	"the text is about",
	"i'll provide",
	"here is the translation",
	"here's the translation",
	"translation:",
	"i need to",
}

// sanitizeTranslation removes leaked reasoning from a model's reply. The
// llm client already strips <think>...</think> blocks; this catches models
// that emit free-text reasoning followed by the actual translation. We
// walk paragraphs from the end and keep the longest contiguous tail with
// no meta markers — that's the real translation.
func sanitizeTranslation(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return s
	}
	lower := strings.ToLower(s)
	hasMeta := false
	for _, m := range metaMarkers {
		if strings.Contains(lower, m) {
			hasMeta = true
			break
		}
	}
	if !hasMeta {
		return s
	}
	paras := strings.Split(s, "\n\n")
	cleanStart := len(paras)
	for i := len(paras) - 1; i >= 0; i-- {
		p := strings.ToLower(paras[i])
		bad := false
		for _, m := range metaMarkers {
			if strings.Contains(p, m) {
				bad = true
				break
			}
		}
		if bad {
			break
		}
		cleanStart = i
	}
	if cleanStart >= len(paras) {
		return s
	}
	return strings.TrimSpace(strings.Join(paras[cleanStart:], "\n\n"))
}

func hashKey(source, lang string) string {
	h := sha256.Sum256([]byte(lang + ":" + source))
	return hex.EncodeToString(h[:])
}

// Translate runs the full pipeline: validate → cache lookup → quota check →
// LLM call → cache store → wallet update. Returns the result or an error.
func (s *Service) Translate(ctx context.Context, userID int64, source, targetLang string) (*Result, error) {
	source = strings.TrimSpace(source)
	if source == "" {
		return nil, ErrEmptySource
	}
	if _, ok := langLabels[targetLang]; !ok {
		return nil, ErrInvalidLang
	}

	cfg, err := s.cfg.GetTranslation()
	if err != nil {
		return nil, err
	}

	hash := hashKey(source, targetLang)

	// Cache hit — free for everyone, no quota touched.
	if hit, err := s.repo.Get(hash); err == nil && hit != nil {
		return &Result{
			Translated: hit.Translated,
			TargetLang: hit.TargetLang,
			Provider:   hit.Provider,
			Model:      hit.Model,
			Cached:     true,
		}, nil
	}

	if cfg.Provider == "" || cfg.Model == "" {
		return nil, ErrNoProvider
	}

	// Quota: count today's translation transactions for this user.
	usedToday, err := s.wallet.CountToday(userID, KindTranslation)
	if err != nil {
		return nil, err
	}
	free := cfg.DailyFreeTranslations
	freeRemaining := free - int(usedToday)
	charge := 0
	if freeRemaining <= 0 {
		charge = cfg.TranslationCost
	}

	// Try to charge first if needed — fail fast before spending an LLM call.
	if charge > 0 {
		if err := s.wallet.Charge(userID, charge, KindTranslation, "translation", 0, "翻译消费"); err != nil {
			return nil, err
		}
	}

	systemPrompt := fmt.Sprintf(
		"You are a translation engine. Output ONLY the final translation in %s. "+
			"Do NOT think out loud. Do NOT explain your reasoning. Do NOT include the source text. "+
			"Do NOT prefix with \"Translation:\", \"Here is\", or any label. Do NOT wrap in quotes. "+
			"The first character of your output must be the first character of the translation.",
		langLabels[targetLang],
	)
	started := time.Now()
	translated, err := s.llm.CompleteWithFeature(ctx, "translation", cfg.Provider, cfg.Model, systemPrompt, source)
	latency := int(time.Since(started).Milliseconds())
	if err != nil {
		// LLM failed AFTER charging — refund the user. Best-effort.
		if charge > 0 {
			if refundErr := s.wallet.Charge(userID, -charge, KindTranslation, "translation_refund", 0, "翻译失败退款"); refundErr != nil {
				log.Printf("translation refund failed: user=%d charge=%d err=%v", userID, charge, refundErr)
			}
		}
		return nil, fmt.Errorf("%w: %v", ErrTranslateFailed, err)
	}
	translated = sanitizeTranslation(translated)
	if translated == "" {
		if charge > 0 {
			if refundErr := s.wallet.Charge(userID, -charge, KindTranslation, "translation_refund", 0, "翻译失败退款"); refundErr != nil {
				log.Printf("translation refund failed: user=%d charge=%d err=%v", userID, charge, refundErr)
			}
		}
		return nil, ErrTranslateFailed
	}

	// Cache the result.
	_ = s.repo.Put(&CacheEntry{
		Hash:       hash,
		TargetLang: targetLang,
		Provider:   cfg.Provider,
		Model:      cfg.Model,
		Translated: translated,
	})

	// Record free usage if this call wasn't already charged — keeps the
	// daily counter accurate for next time.
	if charge == 0 {
		_ = s.wallet.RecordFreeUse(userID, "translation", 0, "免费配额翻译")
		freeRemaining--
		if freeRemaining < 0 {
			freeRemaining = 0
		}
	} else {
		freeRemaining = 0
	}

	return &Result{
		Translated:    translated,
		TargetLang:    targetLang,
		Provider:      cfg.Provider,
		Model:         cfg.Model,
		LatencyMs:     latency,
		Cached:        false,
		Charged:       charge,
		FreeRemaining: freeRemaining,
	}, nil
}
