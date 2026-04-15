package moderation

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

// LLM is the narrow interface moderation needs from the platform LLM router.
// CompleteWithFeature tags each call with a feature label ("moderation") so
// admin-side cost tracking can attribute usage.
type LLM interface {
	Complete(ctx context.Context, provider, model, systemPrompt, userMessage string) (string, error)
	CompleteWithFeature(ctx context.Context, feature, provider, model, systemPrompt, userMessage string) (string, error)
}

// Config is the runtime tunables read from site_settings each call.
type Config struct {
	Enabled           bool
	Provider          string
	Model             string
	BlockAction       bool
	Rules             string // current site.rules content — fed into the prompt
	AutoFlagThreshold int
	SuggestRewrite    bool
}

// ConfigSource lets the service read live config without importing site.
type ConfigSource interface {
	GetModeration() (Config, error)
}

// UserLookup snapshots the actor username for the log.
type UserLookup interface {
	UsernameByID(id int64) (string, error)
}

// Reporter is the narrow interface moderation needs to escalate a repeatedly-
// flagged user into the existing admin report queue. Wired by main.go to
// report.Service. Auto-reports have reporter_id=0 ("system") and use a
// dedupe check in main.go so a single user isn't auto-flagged repeatedly.
type Reporter interface {
	CreateAutoReport(targetUserID int64, reason, note string) error
}

// BotPanel runs a moderation check against every active moderator bot in
// parallel and returns their verdicts. Each verdict is written as its own
// moderation_log row so admins can see which bot flagged which content.
type BotPanel interface {
	CheckAsModerators(ctx context.Context, content, categoryRules string) []BotVerdict
}

// BotVerdict mirrors bot.ModVerdict to keep moderation free of a bot import.
type BotVerdict struct {
	BotID   int64
	BotSlug string
	BotName string
	Verdict string
	Reason  string
}

// Publisher pushes a newly-written moderation log out over the real-time
// stream so connected admin clients can react (badge the nav, prepend to the
// log list) without waiting for the next poll. Implementations must be
// non-blocking — the publisher is called from the moderation hot path.
type Publisher interface {
	PublishModerationLog(log *Log)
}

type Service struct {
	repo      *Repository
	llm       LLM
	cfg       ConfigSource
	users     UserLookup
	reporter  Reporter
	bots      BotPanel
	publisher Publisher
}

func NewService(repo *Repository, llm LLM, cfg ConfigSource, users UserLookup) *Service {
	return &Service{repo: repo, llm: llm, cfg: cfg, users: users}
}

func (s *Service) SetReporter(r Reporter)   { s.reporter = r }
func (s *Service) SetBotPanel(b BotPanel)    { s.bots = b }
func (s *Service) SetPublisher(p Publisher)  { s.publisher = p }

// publish is a nil-safe helper that forwards a persisted log to the stream
// adapter when the verdict is actionable (warn or block). Pass verdicts are
// noise and never pushed.
func (s *Service) publish(row *Log) {
	if s.publisher == nil || row == nil {
		return
	}
	if row.Verdict != VerdictWarn && row.Verdict != VerdictBlock {
		return
	}
	s.publisher.PublishModerationLog(row)
}

// Result is what Check returns to the caller (forum service).
type Result struct {
	LogID   int64
	Verdict string
	Reason  string
	Blocked bool // true when verdict=block AND BlockAction is true
}

// Check evaluates the given content against the live site rules. It always
// returns a non-nil result and never an error in the calling sense — when
// the LLM is unconfigured, disabled, or fails, it returns {Verdict: "pass"}
// so user-visible actions are never blocked by infrastructure problems.
//
// Side effect: writes one row to moderation_logs unless verdict=pass and
// BlockAction is false (i.e. nothing to record).
func (s *Service) Check(ctx context.Context, actorID int64, targetType, content, categoryRules string) Result {
	cfg, err := s.cfg.GetModeration()
	if err != nil || !cfg.Enabled {
		return Result{Verdict: VerdictPass}
	}
	if cfg.Provider == "" || cfg.Model == "" || s.llm == nil {
		return Result{Verdict: VerdictPass}
	}
	rules := strings.TrimSpace(cfg.Rules)
	categoryRules = strings.TrimSpace(categoryRules)
	if rules == "" && categoryRules == "" {
		// No rules to check against — nothing meaningful to do.
		return Result{Verdict: VerdictPass}
	}

	systemPrompt := buildPrompt(rules, categoryRules)
	started := time.Now()
	out, err := s.llm.CompleteWithFeature(ctx, "moderation", cfg.Provider, cfg.Model, systemPrompt, content)
	latency := int(time.Since(started).Milliseconds())
	if err != nil {
		log.Printf("moderation: llm call failed: %v", err)
		return Result{Verdict: VerdictPass}
	}

	verdict, reason := parseVerdict(out)
	username := ""
	if actorID > 0 && s.users != nil {
		username, _ = s.users.UsernameByID(actorID)
	}

	blocked := verdict == VerdictBlock && cfg.BlockAction

	row := &Log{
		TargetType:     targetType,
		ContentHash:    hashContent(content),
		ContentExcerpt: truncRunes(content, 256),
		Verdict:        verdict,
		Reason:         truncRunes(reason, 400),
		Provider:       cfg.Provider,
		Model:          cfg.Model,
		LatencyMs:      latency,
		ActorUserID:    actorID,
		ActorUsername:  username,
		BlockedAction:  blocked,
	}
	if err := s.repo.Create(row); err != nil {
		log.Printf("moderation: log write failed: %v", err)
	} else {
		s.publish(row)
	}

	// Bot panel — fan out to moderator bots, write a log row per verdict,
	// and merge into the final decision (most restrictive wins).
	if s.bots != nil {
		botVerdicts := s.bots.CheckAsModerators(ctx, content, "")
		for _, bv := range botVerdicts {
			if bv.Verdict != VerdictWarn && bv.Verdict != VerdictBlock {
				continue // skip pass/error — don't clutter the log
			}
			botRow := &Log{
				TargetType:     targetType,
				ContentHash:    row.ContentHash,
				ContentExcerpt: row.ContentExcerpt,
				Verdict:        bv.Verdict,
				Reason:         truncRunes("@"+bv.BotSlug+": "+bv.Reason, 400),
				Provider:       "bot",
				Model:          bv.BotSlug,
				LatencyMs:      0,
				ActorUserID:    actorID,
				ActorUsername:  username,
				BlockedAction:  bv.Verdict == VerdictBlock && cfg.BlockAction,
			}
			if err := s.repo.Create(botRow); err == nil {
				s.publish(botRow)
			}
			// Escalate the merged verdict: block beats warn beats pass.
			if bv.Verdict == VerdictBlock {
				verdict = VerdictBlock
				reason = "[@" + bv.BotSlug + "] " + bv.Reason
			} else if bv.Verdict == VerdictWarn && verdict == VerdictPass {
				verdict = VerdictWarn
				reason = "[@" + bv.BotSlug + "] " + bv.Reason
			}
		}
		// Re-evaluate blocked state after the merge.
		blocked = verdict == VerdictBlock && cfg.BlockAction
	}

	// Auto-escalate repeat offenders into the admin report queue.
	if actorID > 0 &&
		(verdict == VerdictWarn || verdict == VerdictBlock) &&
		cfg.AutoFlagThreshold > 0 &&
		s.reporter != nil {
		count, err := s.repo.CountUnresolvedByActor(actorID)
		if err == nil && count >= int64(cfg.AutoFlagThreshold) {
			note := "AI 审核累积 " + strconv.FormatInt(count, 10) + " 条未处理警告"
			if err := s.reporter.CreateAutoReport(actorID, "other", note); err != nil {
				log.Printf("moderation: auto-report failed: %v", err)
			}
		}
	}

	return Result{LogID: row.ID, Verdict: verdict, Reason: reason, Blocked: blocked}
}

// GenerateRewrite asks the model to propose a rule-compliant rewrite of a
// blocked piece of content. Returns the empty string on any failure so the
// caller can fall back to the plain block error.
func (s *Service) GenerateRewrite(ctx context.Context, content, reason, categoryRules string) string {
	cfg, err := s.cfg.GetModeration()
	if err != nil || !cfg.Enabled || !cfg.SuggestRewrite {
		return ""
	}
	if cfg.Provider == "" || cfg.Model == "" || s.llm == nil {
		return ""
	}
	siteRules := strings.TrimSpace(cfg.Rules)
	catRules := strings.TrimSpace(categoryRules)
	if siteRules == "" && catRules == "" {
		return ""
	}
	systemPrompt := buildRewritePrompt(siteRules, catRules, reason)
	out, err := s.llm.CompleteWithFeature(ctx, "moderation", cfg.Provider, cfg.Model, systemPrompt, content)
	if err != nil {
		log.Printf("moderation: rewrite failed: %v", err)
		return ""
	}
	out = strings.TrimSpace(out)
	// Strip accidental markdown code fences.
	out = strings.TrimPrefix(out, "```")
	out = strings.TrimSuffix(out, "```")
	out = strings.TrimSpace(out)
	// Truncate extremely long rewrites to keep the error payload sane.
	return truncRunes(out, 2000)
}

func buildRewritePrompt(siteRules, categoryRules, reason string) string {
	var rulesSection string
	if siteRules != "" {
		rulesSection += "----- 全站规则 -----\n" + siteRules + "\n----- 结束 -----\n"
	}
	if categoryRules != "" {
		rulesSection += "\n----- 本板规则 -----\n" + categoryRules + "\n----- 结束 -----\n"
	}
	return fmt.Sprintf(`你是 Redup 社区的内容润色助手。用户的内容被判定违反了规则，原因是：「%s」。

%s

请在保留用户原意的前提下，改写他们接下来发送的内容，使其完全符合上述规则。
要求：
- 只输出改写后的正文，不要任何解释、前言、代码块或 markdown 标记
- 保留原文的核心观点和语气
- 如果原文有严重违规无法改写（比如纯粹的辱骂或垃圾），就直接输出空字符串`, reason, rulesSection)
}

// LinkTarget ties a freshly-created topic/post id onto its moderation log so
// admins can later click through to the actual content for review.
func (s *Service) LinkTarget(logID, targetID int64) {
	if logID == 0 || targetID == 0 {
		return
	}
	if err := s.repo.UpdateTargetID(logID, targetID); err != nil {
		log.Printf("moderation: link target failed: %v", err)
	}
}

// MarkResolved flips a log row to resolved=true after an admin has taken
// action (or explicitly dismissed the warning).
func (s *Service) MarkResolved(logID int64) error {
	return s.repo.MarkResolved(logID)
}

func (s *Service) ByID(id int64) (*Log, error) {
	return s.repo.ByID(id)
}

func buildPrompt(siteRules, categoryRules string) string {
	var rulesSection string
	if siteRules != "" {
		rulesSection += "----- 全站规则 -----\n" + siteRules + "\n----- 结束 -----\n"
	}
	if categoryRules != "" {
		rulesSection += "\n----- 本板规则（在全站规则之上额外生效）-----\n" +
			categoryRules + "\n----- 结束 -----\n"
	}
	return fmt.Sprintf(`你是 Redup 社区的内容审核员。下面是适用的规则：

%s

请判断接下来用户发布的内容是否违反规则。返回纯 JSON，格式：
{"verdict": "pass" | "warn" | "block", "reason": "中文一句话理由"}

规则：
- pass：完全无问题
- warn：擦边、可疑但不构成违规，记录留作复核
- block：明显违规，必须拦截

不要输出任何 JSON 之外的文字，不要 markdown 代码块。`, rulesSection)
}

var jsonRe = regexp.MustCompile(`(?s)\{.*\}`)

func parseVerdict(raw string) (string, string) {
	raw = strings.TrimSpace(raw)
	// Strip markdown code fences if the model added them.
	raw = strings.TrimPrefix(raw, "```json")
	raw = strings.TrimPrefix(raw, "```")
	raw = strings.TrimSuffix(raw, "```")
	raw = strings.TrimSpace(raw)

	// Best-effort: pull the first {...} block in case the model added prose.
	if !strings.HasPrefix(raw, "{") {
		if m := jsonRe.FindString(raw); m != "" {
			raw = m
		}
	}

	var parsed struct {
		Verdict string `json:"verdict"`
		Reason  string `json:"reason"`
	}
	if err := json.Unmarshal([]byte(raw), &parsed); err != nil {
		return VerdictPass, "parse error: " + err.Error()
	}
	switch parsed.Verdict {
	case VerdictPass, VerdictWarn, VerdictBlock:
		return parsed.Verdict, parsed.Reason
	default:
		return VerdictPass, "unknown verdict: " + parsed.Verdict
	}
}

func hashContent(s string) string {
	sum := sha256.Sum256([]byte(s))
	return hex.EncodeToString(sum[:])
}

func truncRunes(s string, max int) string {
	if utf8.RuneCountInString(s) <= max {
		return s
	}
	runes := []rune(s)
	return string(runes[:max])
}

// ---------- Admin queries ----------

func (s *Service) List(opts ListOptions) ([]Log, int64, error) {
	return s.repo.List(opts)
}

func (s *Service) Counts() (map[string]int64, error) {
	return s.repo.Counts()
}
