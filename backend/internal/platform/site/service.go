package site

import (
	"encoding/json"
	"log"
)

// Service is the typed facade over the key/value repository. Each group has
// Load*/Save* methods, and a single Load()/Snapshot() returns the whole
// config for /admin/site page hydration.
type Service struct {
	repo *Repository

	// Optional callback fired when site.anon.prefix changes. Lets the anon
	// module hot-update its runtime generator without a server restart.
	onAnonPrefixChange func(string)

	// Optional callback fired when site.llm providers change. Main wires
	// this to rebuild the llm.Router's client map so admin edits take
	// effect on the next API call rather than on the next restart.
	onLLMChange func(LLM)

	// Optional callback fired when site.basic is saved. Main wires this
	// to hot-reload the bot webhook proxy URL without a restart.
	onBasicChange func(Basic)

	// Optional callback fired when site.smtp is saved. Main wires this
	// to the mailer service so admin edits take effect on the next Send.
	onSMTPChange func(SMTP)
}

func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

// OnAnonPrefixChange registers a callback invoked whenever the anon group is
// saved. Main wires this to anonSvc.SetPrefix.
func (s *Service) OnAnonPrefixChange(fn func(prefix string)) {
	s.onAnonPrefixChange = fn
}

// OnLLMChange registers a callback invoked whenever the llm providers
// list is saved. Main wires this to rebuild llm.Router's client map.
func (s *Service) OnLLMChange(fn func(LLM)) {
	s.onLLMChange = fn
}

// OnBasicChange registers a callback invoked whenever the basic group is
// saved. Main wires this to push the new OutboundProxyURL into the bot
// webhook client without a server restart.
func (s *Service) OnBasicChange(fn func(Basic)) {
	s.onBasicChange = fn
}

// OnSMTPChange registers a callback invoked whenever the smtp group is
// saved. Main wires this to mailer.Service.SetConfig so the next Send
// picks up the new credentials without a restart.
func (s *Service) OnSMTPChange(fn func(SMTP)) {
	s.onSMTPChange = fn
}

// ---------- Seeds ----------

// SeedDefaults ensures every key has a row. Run once on startup. Idempotent.
func (s *Service) SeedDefaults() error {
	for _, pair := range []struct {
		key  string
		dflt any
	}{
		{KeyBasic, defaultBasic()},
		{KeyRegistration, defaultRegistration()},
		{KeySEO, defaultSEO()},
		{KeyRules, defaultRules()},
		{KeyFooter, defaultFooter()},
		{KeyAnon, defaultAnon()},
		{KeyCredits, defaultCredits()},
		{KeyModeration, defaultModeration()},
		{KeyLLM, defaultLLM()},
		{KeySMTP, defaultSMTP()},
		{KeyLinks, defaultLinks()},
	} {
		raw, err := s.repo.Get(pair.key)
		if err != nil {
			return err
		}
		if raw == nil {
			if err := s.repo.Set(pair.key, pair.dflt, 0); err != nil {
				return err
			}
			log.Printf("seeded site setting: %s", pair.key)
		}
	}
	return nil
}

func defaultBasic() Basic {
	return Basic{
		Name:        "Redup",
		Tagline:     "让真人、匿名者与 AI 智能体共同生活的社区",
		Description: "Redup 是一个混合式社区平台，融合传统论坛、匿名讨论版与 AI Bot 生态。",
		Language:              "zh-CN",
		Timezone:              "Asia/Shanghai",
		PostEditWindowMinutes: 5,
	}
}

func defaultRegistration() Registration {
	return Registration{
		Mode:                 "open",
		EmailVerifyRequired:  false,
		InviteRequired:       false,
		UsernameMinLen:       3,
		UsernameMaxLen:       32,
		ReservedUsernames:    []string{"admin", "root", "redup", "official", "support"},
		PasswordMinLen:       8,
		PasswordRequireMixed: false,
		AllowAnonEntry:       true,
		MinLevelForAnon:      2,
	}
}

func defaultSEO() SEO {
	return SEO{Indexable: true, Sitemap: true}
}

func defaultRules() Rules {
	return Rules{
		Content: "# 社区规则\n\n待补充。",
	}
}

func defaultFooter() Footer {
	return Footer{Copyright: "© 2026 Redup"}
}

func defaultAnon() Anon {
	return Anon{Prefix: "Anon"}
}

func defaultCredits() Credits {
	return Credits{
		SignupBonus:           Reward{XP: 0, Credits: 200},
		TopicReward:           Reward{XP: 5, Credits: 2},
		PostReward:            Reward{XP: 1, Credits: 1},
		LikeXPReward:          1,
		ViolationPenalty:      20,
		DailyTopicCap:         5,
		DailyPostCap:          30,
		DailyLikeXPCap:        50,
		MinTopicLength:        20,
		MinPostLength:         5,
		LevelThresholds:       []int{0, 100, 300, 800, 2000, 5000, 12000, 25000, 50000, 100000},
		DailyFreeTranslations: 5,
		TranslationCost:       10,
		TranslationProvider:   "openai",
		TranslationModel:      "gpt-4o-mini",
	}
}

func defaultModeration() Moderation {
	return Moderation{
		Enabled:           false,
		Provider:          "openai",
		Model:             "gpt-4o-mini",
		BlockAction:       false,
		AutoFlagThreshold: 3,
		SuggestRewrite:    false,
	}
}

func defaultLinks() Links {
	return Links{
		ExternalWarnEnabled: false,
		TrustedDomains:      []string{},
	}
}

func defaultSMTP() SMTP {
	return SMTP{
		Enabled:    false,
		Host:       "",
		Port:       587,
		Encryption: "starttls",
	}
}

// defaultLLM is an empty list — admin must add providers explicitly from
// the admin panel. main.go's bootstrap will seed a couple of entries
// from legacy .env vars if they're present and the list is still empty,
// so existing deployments don't break on first boot.
func defaultLLM() LLM {
	return LLM{Providers: []LLMProvider{}}
}

// ---------- Typed getters ----------

func (s *Service) GetBasic() (Basic, error) {
	var v Basic
	return v, s.loadInto(KeyBasic, defaultBasic(), &v)
}

func (s *Service) GetRegistration() (Registration, error) {
	var v Registration
	return v, s.loadInto(KeyRegistration, defaultRegistration(), &v)
}

func (s *Service) GetSEO() (SEO, error) {
	var v SEO
	return v, s.loadInto(KeySEO, defaultSEO(), &v)
}

func (s *Service) GetRules() (Rules, error) {
	var v Rules
	return v, s.loadInto(KeyRules, defaultRules(), &v)
}

func (s *Service) GetFooter() (Footer, error) {
	var v Footer
	return v, s.loadInto(KeyFooter, defaultFooter(), &v)
}

func (s *Service) GetAnon() (Anon, error) {
	var v Anon
	return v, s.loadInto(KeyAnon, defaultAnon(), &v)
}

func (s *Service) GetCredits() (Credits, error) {
	var v Credits
	return v, s.loadInto(KeyCredits, defaultCredits(), &v)
}

func (s *Service) GetModeration() (Moderation, error) {
	var v Moderation
	return v, s.loadInto(KeyModeration, defaultModeration(), &v)
}

func (s *Service) GetLLM() (LLM, error) {
	var v LLM
	return v, s.loadInto(KeyLLM, defaultLLM(), &v)
}

func (s *Service) GetSMTP() (SMTP, error) {
	var v SMTP
	return v, s.loadInto(KeySMTP, defaultSMTP(), &v)
}

func (s *Service) GetLinks() (Links, error) {
	var v Links
	return v, s.loadInto(KeyLinks, defaultLinks(), &v)
}

// loadInto reads the raw JSON for key, falling back to the provided default
// if the row is missing. Panics are impossible — bad JSON yields an error.
func (s *Service) loadInto(key string, fallback any, dst any) error {
	raw, err := s.repo.Get(key)
	if err != nil {
		return err
	}
	if raw == nil {
		raw, err = json.Marshal(fallback)
		if err != nil {
			return err
		}
	}
	return json.Unmarshal(raw, dst)
}

// ---------- Typed setters ----------

func (s *Service) SaveBasic(v Basic, by int64) error {
	if err := s.repo.Set(KeyBasic, v, by); err != nil {
		return err
	}
	if s.onBasicChange != nil {
		s.onBasicChange(v)
	}
	return nil
}

func (s *Service) SaveRegistration(v Registration, by int64) error {
	return s.repo.Set(KeyRegistration, v, by)
}

func (s *Service) SaveSEO(v SEO, by int64) error {
	return s.repo.Set(KeySEO, v, by)
}

func (s *Service) SaveRules(v Rules, by int64) error {
	return s.repo.Set(KeyRules, v, by)
}

func (s *Service) SaveFooter(v Footer, by int64) error {
	return s.repo.Set(KeyFooter, v, by)
}

func (s *Service) SaveCredits(v Credits, by int64) error {
	return s.repo.Set(KeyCredits, v, by)
}

func (s *Service) SaveModeration(v Moderation, by int64) error {
	return s.repo.Set(KeyModeration, v, by)
}

func (s *Service) SaveAnon(v Anon, by int64) error {
	if err := s.repo.Set(KeyAnon, v, by); err != nil {
		return err
	}
	if s.onAnonPrefixChange != nil {
		s.onAnonPrefixChange(v.Prefix)
	}
	return nil
}

// SaveLinks persists the outbound-link policy. No hot-reload hook
// yet because the frontend reads this on each admin snapshot — when
// the renderer starts consuming the list live, this can grow an
// OnLinksChange callback the same shape as OnSMTPChange.
func (s *Service) SaveLinks(v Links, by int64) error {
	return s.repo.Set(KeyLinks, v, by)
}

// SaveSMTP persists the mail delivery config and notifies any
// registered listener (main.go → mailer.Service) so live sends pick
// up the change without a restart.
func (s *Service) SaveSMTP(v SMTP, by int64) error {
	if err := s.repo.Set(KeySMTP, v, by); err != nil {
		return err
	}
	if s.onSMTPChange != nil {
		s.onSMTPChange(v)
	}
	return nil
}

// SaveLLM persists the providers list and notifies any registered
// listener (main.go → llm.Router) so live calls pick up the change
// without a restart.
func (s *Service) SaveLLM(v LLM, by int64) error {
	if err := s.repo.Set(KeyLLM, v, by); err != nil {
		return err
	}
	if s.onLLMChange != nil {
		s.onLLMChange(v)
	}
	return nil
}

// ---------- Snapshot ----------

// Snapshot is the full config used by /admin/site for initial load and by
// public callers (minus sensitive fields the handler filters out).
type Snapshot struct {
	Basic        Basic        `json:"basic"`
	Registration Registration `json:"registration"`
	SEO          SEO          `json:"seo"`
	Rules        Rules        `json:"rules"`
	Footer       Footer       `json:"footer"`
	Anon         Anon         `json:"anon"`
	Credits      Credits      `json:"credits"`
	Moderation   Moderation   `json:"moderation"`
	LLM          LLM          `json:"llm"`
	SMTP         SMTP         `json:"smtp"`
	Links        Links        `json:"links"`
}

// MaskedSnapshot is like Snapshot but strips api keys from the LLM
// providers list so the admin UI never receives them in plaintext.
func (s *Service) MaskedSnapshot() (Snapshot, error) {
	snap, err := s.Snapshot()
	if err != nil {
		return snap, err
	}
	for i := range snap.LLM.Providers {
		if snap.LLM.Providers[i].APIKey != "" {
			snap.LLM.Providers[i].APIKey = "••••••••"
		}
	}
	if snap.SMTP.Password != "" {
		snap.SMTP.Password = "••••••••"
	}
	return snap, nil
}

func (s *Service) Snapshot() (Snapshot, error) {
	var snap Snapshot
	var err error
	if snap.Basic, err = s.GetBasic(); err != nil {
		return snap, err
	}
	if snap.Registration, err = s.GetRegistration(); err != nil {
		return snap, err
	}
	if snap.SEO, err = s.GetSEO(); err != nil {
		return snap, err
	}
	if snap.Rules, err = s.GetRules(); err != nil {
		return snap, err
	}
	if snap.Footer, err = s.GetFooter(); err != nil {
		return snap, err
	}
	if snap.Anon, err = s.GetAnon(); err != nil {
		return snap, err
	}
	if snap.Credits, err = s.GetCredits(); err != nil {
		return snap, err
	}
	if snap.Moderation, err = s.GetModeration(); err != nil {
		return snap, err
	}
	if snap.LLM, err = s.GetLLM(); err != nil {
		return snap, err
	}
	if snap.SMTP, err = s.GetSMTP(); err != nil {
		return snap, err
	}
	if snap.Links, err = s.GetLinks(); err != nil {
		return snap, err
	}
	return snap, nil
}

// MaskedLLM returns the provider list with API keys replaced by a
// fixed-width mask. Used by the admin snapshot endpoint so the
// frontend can render provider rows without ever seeing the real key.
// Admins who want to rotate a key must submit a fresh one through the
// put endpoint — the backend treats an empty api_key on put as "keep
// existing", so the round-trip stays safe (see handler.putLLM).
func (s *Service) MaskedLLM() (LLM, error) {
	v, err := s.GetLLM()
	if err != nil {
		return v, err
	}
	for i := range v.Providers {
		if v.Providers[i].APIKey != "" {
			v.Providers[i].APIKey = "••••••••"
		}
	}
	return v, nil
}
