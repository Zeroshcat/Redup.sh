package site

import (
	"time"

	"gorm.io/datatypes"
)

// Setting is a single key/value row. The value is JSONB so each group's
// schema can evolve independently without migrations.
type Setting struct {
	Key       string         `gorm:"primaryKey;size:64" json:"key"`
	Value     datatypes.JSON `gorm:"type:jsonb" json:"value"`
	UpdatedAt time.Time      `gorm:"autoUpdateTime" json:"updated_at"`
	UpdatedBy int64          `json:"updated_by,omitempty"`
}

func (Setting) TableName() string { return "site_settings" }

// Group keys — each logical section of the admin UI has its own row.
const (
	KeyBasic        = "site.basic"
	KeyRegistration = "site.registration"
	KeySEO          = "site.seo"
	KeyRules        = "site.rules"
	KeyFooter       = "site.footer"
	KeyAnon         = "site.anon"
	KeyCredits      = "site.credits"
	KeyModeration   = "site.moderation"
	KeyLLM          = "site.llm"
	KeySMTP         = "site.smtp"
	KeyLinks        = "site.links"
)

// Typed structs for each group. These define the canonical shape persisted
// under each key. Frontend talks JSON shapes that match these.

type Basic struct {
	Name         string `json:"name"`
	Tagline      string `json:"tagline"`
	Description  string `json:"description"`
	LogoURL      string `json:"logo_url,omitempty"`
	ContactEmail string `json:"contact_email,omitempty"`
	Language     string `json:"language"`
	Timezone     string `json:"timezone"`

	// PostEditWindowMinutes is how long after publish an author can still
	// edit their own topic body or reply. 0 disables the window (only admins
	// / moderators with PermEditAny can edit). Admins are never gated.
	PostEditWindowMinutes int `json:"post_edit_window_minutes"`

	// OutboundProxyURL is an optional HTTP(S) / SOCKS5 proxy used for
	// platform-initiated outbound calls (currently bot webhook delivery).
	// When set, the bot webhook client routes all POSTs to user bots
	// through this proxy — useful for hiding the real server IP from bot
	// operators' access logs or escaping restrictive egress networks.
	// Formats: http://host:port, https://host:port, socks5://host:port
	// Empty string disables the proxy.
	OutboundProxyURL string `json:"outbound_proxy_url,omitempty"`
}

type Registration struct {
	Mode                  string   `json:"mode"` // open / invite / review / closed
	EmailVerifyRequired   bool     `json:"email_verify_required"`
	EmailDomainRestricted bool     `json:"email_domain_restricted"`
	AllowedEmailDomains   []string `json:"allowed_email_domains,omitempty"`
	InviteRequired        bool     `json:"invite_required"`
	UsernameMinLen        int      `json:"username_min_len"`
	UsernameMaxLen        int      `json:"username_max_len"`
	ReservedUsernames     []string `json:"reserved_usernames,omitempty"`
	PasswordMinLen        int      `json:"password_min_len"`
	PasswordRequireMixed  bool     `json:"password_require_mixed"`
	AllowAnonEntry        bool     `json:"allow_anon_entry"`
	MinLevelForAnon       int      `json:"min_level_for_anon"`
}

type SEO struct {
	Indexable        bool   `json:"indexable"`
	Sitemap          bool   `json:"sitemap"`
	DefaultOGImage   string `json:"default_og_image,omitempty"`
	GoogleAnalyticsID string `json:"google_analytics_id,omitempty"`
}

type Rules struct {
	Content string `json:"content"`
}

type FooterLink struct {
	Label string `json:"label"`
	URL   string `json:"url"`
}

type Footer struct {
	Copyright string       `json:"copyright"`
	ICP       string       `json:"icp,omitempty"`
	ICPLink   string       `json:"icp_link,omitempty"`
	PoliceICP string       `json:"police_icp,omitempty"`
	Links     []FooterLink `json:"links,omitempty"`
}

type Anon struct {
	Prefix string `json:"prefix"`
}

// Reward bundles the XP + credits award for a single triggering action.
type Reward struct {
	XP      int `json:"xp"`
	Credits int `json:"credits"`
}

// Credits is the platform-wide economy config. All thresholds are admin-tunable
// from the /admin/site page; reward hooks read this struct on each call so a
// change takes effect without a restart.
type Credits struct {
	SignupBonus      Reward `json:"signup_bonus"`
	TopicReward      Reward `json:"topic_reward"`
	PostReward       Reward `json:"post_reward"`
	LikeXPReward     int    `json:"like_xp_reward"`
	ViolationPenalty int    `json:"violation_penalty"`

	// Daily caps — the Nth+1 award of a given kind in the same UTC day is
	// silently dropped (no XP / no credits). 0 means unlimited.
	DailyTopicCap   int `json:"daily_topic_cap"`
	DailyPostCap    int `json:"daily_post_cap"`
	DailyLikeXPCap  int `json:"daily_like_xp_cap"`

	// Quality gate — minimum rune count required to qualify for the topic /
	// post reward. Below this length the action still succeeds but no XP/
	// credits are granted.
	MinTopicLength int `json:"min_topic_length"`
	MinPostLength  int `json:"min_post_length"`

	// LevelThresholds[i] is the XP needed to be at level i+1. A user with XP
	// >= LevelThresholds[i] is at least level i+1.
	LevelThresholds []int `json:"level_thresholds"`

	// Translation feature config — daily free quota, per-call cost beyond it,
	// and which platform LLM provider / model to dispatch to.
	DailyFreeTranslations int    `json:"daily_free_translations"`
	TranslationCost       int    `json:"translation_cost"`
	TranslationProvider   string `json:"translation_provider"`
	TranslationModel      string `json:"translation_model"`
}

// LLM is the admin-managed list of upstream model providers. Each entry is
// a self-contained endpoint the platform can dispatch Complete() calls to:
// credentials, base URL, supported models, and a stable ID that other
// settings (moderation.provider, credits.translation_provider, etc.)
// reference by string. Storing these in site_settings means an admin can
// add a new provider — including any OpenAI-compatible third party like
// DeepSeek, Moonshot, local Ollama — from the admin panel without
// redeploying the backend or editing .env files.
type LLM struct {
	Providers []LLMProvider `json:"providers"`
}

// LLMProvider describes one configurable upstream. The Kind field selects
// the HTTP client implementation in the llm package:
//   - "openai" — OpenAI's /chat/completions shape; also covers every
//     OpenAI-compatible endpoint (DeepSeek, Moonshot, Ollama with
//     OpenAI mode, vLLM, LM Studio, etc.). Custom base URL supported.
//   - "anthropic" — Anthropic's /messages shape with the x-api-key header.
type LLMProvider struct {
	ID       string   `json:"id"`               // stable key used by moderation.provider / credits.translation_provider
	Name     string   `json:"name"`             // display name for admin dropdowns
	Kind     string   `json:"kind"`             // "openai" | "anthropic"
	BaseURL  string   `json:"base_url"`         // e.g. https://api.deepseek.com/v1
	APIKey   string   `json:"api_key"`          // raw key, filtered out of public snapshots
	Enabled  bool     `json:"enabled"`          // disabled providers are kept on the list but never dispatched
	Models   []string `json:"models,omitempty"` // suggested models for the UI dropdown; not enforced server-side
	Note     string   `json:"note,omitempty"`   // free-form note for the admin
}

const (
	LLMKindOpenAI    = "openai"
	LLMKindAnthropic = "anthropic"
)

// Links controls how outbound links in user-generated content are
// rendered. Stage A of the feature only consumes this field in the
// admin UI; the frontend markdown renderer currently decorates every
// off-origin http(s) link regardless. When Stage B ships, the
// renderer (or a gateway /redirect route) will consult TrustedDomains
// to decide whether to bypass the interstitial for known-safe hosts.
type Links struct {
	ExternalWarnEnabled bool     `json:"external_warn_enabled"`
	TrustedDomains      []string `json:"trusted_domains,omitempty"`

	// PreviewEnabled gates the server-side OG fetcher. When false,
	// /api/link-preview always returns 503 regardless of URL.
	PreviewEnabled bool `json:"preview_enabled"`

	// DenylistDomains is a lower-case list of hosts whose previews
	// should never be fetched. Matches the host verbatim or any
	// subdomain (example.com matches blog.example.com).
	DenylistDomains []string `json:"denylist_domains,omitempty"`
}

// SMTP holds outbound mail delivery credentials. Password is persisted
// in plaintext in site_settings but stripped to a fixed-width mask by
// MaskedSnapshot before it ever leaves the server — mirror of how LLM
// api keys are handled. On admin save, an empty or mask-value password
// means "keep the stored credential".
type SMTP struct {
	Enabled     bool   `json:"enabled"`
	Host        string `json:"host"`
	Port        int    `json:"port"`
	Username    string `json:"username,omitempty"`
	Password    string `json:"password,omitempty"`
	Encryption  string `json:"encryption"` // "none" | "starttls" | "tls"
	FromAddress string `json:"from_address"`
	FromName    string `json:"from_name,omitempty"`
}

// Moderation is the LLM-based content audit config. Reads site.rules at call
// time as the rule baseline, then asks the model to judge new posts against
// it. All decisions are recorded to moderation_logs for admin review.
type Moderation struct {
	Enabled     bool   `json:"enabled"`
	Provider    string `json:"provider"`
	Model       string `json:"model"`
	BlockAction bool   `json:"block_action"` // when false, "block" verdicts only log (dry-run mode)

	// AutoFlagThreshold is the number of unresolved warn/block verdicts a
	// user needs to accumulate before an automatic system-report is filed
	// against them. 0 disables auto-flagging.
	AutoFlagThreshold int `json:"auto_flag_threshold"`

	// SuggestRewrite controls whether a "block" verdict is accompanied by a
	// second LLM call that asks for a rule-compliant rewrite. The user sees
	// the suggestion in the error response and can adopt it or edit freely.
	SuggestRewrite bool `json:"suggest_rewrite"`
}
