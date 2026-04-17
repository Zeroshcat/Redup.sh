package site

import (
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/redup/backend/internal/audit"
	"github.com/redup/backend/internal/auth"
	httpx "github.com/redup/backend/internal/http"
)

type Handler struct {
	svc   *Service
	audit *audit.Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

func (h *Handler) SetAudit(a *audit.Service) { h.audit = a }

func (h *Handler) record(c *gin.Context, group string) {
	if h.audit != nil {
		h.audit.Record(c, audit.Input{
			Action:      "site.update",
			TargetType:  "site",
			TargetLabel: group,
		})
	}
}

// PublicInfo is the subset visible to unauthenticated visitors. Keep this
// intentionally lean — any field added here is exposed to the world.
//
// ExternalWarnEnabled + TrustedDomains are exposed because every
// user-rendered markdown needs them: the frontend's MarkdownRenderer
// rewrites non-trusted external hrefs into an interstitial redirect
// URL. Shipping them here avoids a second round-trip on every SSR.
type PublicInfo struct {
	Name                string   `json:"name"`
	Tagline             string   `json:"tagline"`
	Description         string   `json:"description"`
	LogoURL             string   `json:"logo_url,omitempty"`
	Language            string   `json:"language"`
	RegistrationMode    string   `json:"registration_mode"`
	AnonPrefix          string   `json:"anon_prefix"`
	ExternalWarnEnabled bool     `json:"external_warn_enabled"`
	TrustedDomains      []string `json:"trusted_domains,omitempty"`
	PreviewEnabled      bool     `json:"preview_enabled"`
}

// RegisterPublic mounts the public, unauthenticated site info endpoint. The
// frontend calls this on every SSR to show the real site name in the header.
func (h *Handler) RegisterPublic(r *gin.RouterGroup) {
	r.GET("/site", h.publicInfo)
}

// RegisterAdmin mounts the admin CRUD endpoints. Caller is expected to apply
// auth + rbac middleware before calling this.
func (h *Handler) RegisterAdmin(r *gin.RouterGroup) {
	r.GET("/site", h.snapshot)
	r.PUT("/site/basic", h.putBasic)
	r.PUT("/site/registration", h.putRegistration)
	r.PUT("/site/seo", h.putSEO)
	r.PUT("/site/rules", h.putRules)
	r.PUT("/site/footer", h.putFooter)
	r.PUT("/site/anon", h.putAnon)
	r.PUT("/site/credits", h.putCredits)
	r.PUT("/site/moderation", h.putModeration)
	r.PUT("/site/llm", h.putLLM)
	r.PUT("/site/smtp", h.putSMTP)
	r.PUT("/site/links", h.putLinks)
}

func (h *Handler) publicInfo(c *gin.Context) {
	basic, err := h.svc.GetBasic()
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	reg, err := h.svc.GetRegistration()
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	anon, err := h.svc.GetAnon()
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	links, err := h.svc.GetLinks()
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	httpx.OK(c, PublicInfo{
		Name:                basic.Name,
		Tagline:             basic.Tagline,
		Description:         basic.Description,
		LogoURL:             basic.LogoURL,
		Language:            basic.Language,
		RegistrationMode:    reg.Mode,
		AnonPrefix:          anon.Prefix,
		ExternalWarnEnabled: links.ExternalWarnEnabled,
		TrustedDomains:      links.TrustedDomains,
		PreviewEnabled:      links.PreviewEnabled,
	})
}

func (h *Handler) snapshot(c *gin.Context) {
	// Use the masked variant so API keys never leave the server in
	// plaintext. Admins who need to rotate a key submit a fresh value
	// via putLLM; see the "keep existing" rule in that handler.
	snap, err := h.svc.MaskedSnapshot()
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	httpx.OK(c, snap)
}

func (h *Handler) putBasic(c *gin.Context) {
	var v Basic
	if err := c.ShouldBindJSON(&v); err != nil {
		httpx.BadRequest(c, "invalid request")
		return
	}
	uid, _ := auth.CurrentUserID(c)
	if err := h.svc.SaveBasic(v, uid); err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	h.record(c, "basic")
	httpx.OK(c, v)
}

func (h *Handler) putRegistration(c *gin.Context) {
	var v Registration
	if err := c.ShouldBindJSON(&v); err != nil {
		httpx.BadRequest(c, "invalid request")
		return
	}
	uid, _ := auth.CurrentUserID(c)
	if err := h.svc.SaveRegistration(v, uid); err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	h.record(c, "registration")
	httpx.OK(c, v)
}

func (h *Handler) putSEO(c *gin.Context) {
	var v SEO
	if err := c.ShouldBindJSON(&v); err != nil {
		httpx.BadRequest(c, "invalid request")
		return
	}
	uid, _ := auth.CurrentUserID(c)
	if err := h.svc.SaveSEO(v, uid); err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	h.record(c, "seo")
	httpx.OK(c, v)
}

func (h *Handler) putRules(c *gin.Context) {
	var v Rules
	if err := c.ShouldBindJSON(&v); err != nil {
		httpx.BadRequest(c, "invalid request")
		return
	}
	uid, _ := auth.CurrentUserID(c)
	if err := h.svc.SaveRules(v, uid); err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	h.record(c, "rules")
	httpx.OK(c, v)
}

func (h *Handler) putFooter(c *gin.Context) {
	var v Footer
	if err := c.ShouldBindJSON(&v); err != nil {
		httpx.BadRequest(c, "invalid request")
		return
	}
	uid, _ := auth.CurrentUserID(c)
	if err := h.svc.SaveFooter(v, uid); err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	h.record(c, "footer")
	httpx.OK(c, v)
}

func (h *Handler) putModeration(c *gin.Context) {
	var v Moderation
	if err := c.ShouldBindJSON(&v); err != nil {
		httpx.BadRequest(c, "invalid request")
		return
	}
	uid, _ := auth.CurrentUserID(c)
	if err := h.svc.SaveModeration(v, uid); err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	h.record(c, "moderation")
	httpx.OK(c, v)
}

func (h *Handler) putCredits(c *gin.Context) {
	var v Credits
	if err := c.ShouldBindJSON(&v); err != nil {
		httpx.BadRequest(c, "invalid request")
		return
	}
	uid, _ := auth.CurrentUserID(c)
	if err := h.svc.SaveCredits(v, uid); err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	h.record(c, "credits")
	httpx.OK(c, v)
}

func (h *Handler) putAnon(c *gin.Context) {
	var v Anon
	if err := c.ShouldBindJSON(&v); err != nil {
		httpx.BadRequest(c, "invalid request")
		return
	}
	uid, _ := auth.CurrentUserID(c)
	if err := h.svc.SaveAnon(v, uid); err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	h.record(c, "anon")
	httpx.OK(c, v)
}

// putLinks saves the outbound-link policy. Normalizes both domain
// lists: trims whitespace, lower-cases, and drops blank / duplicate
// entries so the admin can paste a sloppy list and we still store a
// clean one.
func (h *Handler) putLinks(c *gin.Context) {
	var v Links
	if err := c.ShouldBindJSON(&v); err != nil {
		httpx.BadRequest(c, "invalid request")
		return
	}
	v.TrustedDomains = cleanDomainList(v.TrustedDomains)
	v.DenylistDomains = cleanDomainList(v.DenylistDomains)

	uid, _ := auth.CurrentUserID(c)
	if err := h.svc.SaveLinks(v, uid); err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	h.record(c, "links")
	httpx.OK(c, v)
}

func cleanDomainList(in []string) []string {
	seen := map[string]struct{}{}
	out := make([]string, 0, len(in))
	for _, d := range in {
		d = strings.ToLower(strings.TrimSpace(d))
		if d == "" {
			continue
		}
		if _, dup := seen[d]; dup {
			continue
		}
		seen[d] = struct{}{}
		out = append(out, d)
	}
	return out
}

// putSMTP saves the SMTP credentials. Empty or mask-placeholder
// password means "keep the stored credential" — mirrors the pattern
// used for LLM api keys. Returns the masked view so the admin UI
// refreshes its mask on save without ever seeing the real password.
func (h *Handler) putSMTP(c *gin.Context) {
	var v SMTP
	if err := c.ShouldBindJSON(&v); err != nil {
		httpx.BadRequest(c, "invalid request")
		return
	}
	v.Host = strings.TrimSpace(v.Host)
	v.Username = strings.TrimSpace(v.Username)
	v.FromAddress = strings.TrimSpace(v.FromAddress)
	v.FromName = strings.TrimSpace(v.FromName)
	v.Encryption = strings.ToLower(strings.TrimSpace(v.Encryption))

	if v.Encryption == "" {
		v.Encryption = "starttls"
	}
	switch v.Encryption {
	case "none", "starttls", "tls":
	default:
		httpx.ValidationError(c, "invalid_smtp_encryption", "encryption must be none / starttls / tls")
		return
	}

	// Preserve stored password when the caller sent empty or the mask.
	if v.Password == "" || v.Password == "••••••••" {
		existing, err := h.svc.GetSMTP()
		if err != nil {
			httpx.Internal(c, err.Error())
			return
		}
		v.Password = existing.Password
	}

	uid, _ := auth.CurrentUserID(c)
	if err := h.svc.SaveSMTP(v, uid); err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	h.record(c, "smtp")

	masked := v
	if masked.Password != "" {
		masked.Password = "••••••••"
	}
	httpx.OK(c, masked)
}

// putLLM replaces the full providers list. Validation pins the kind to
// a known value and rejects duplicate / empty IDs so dispatch stays
// unambiguous. Empty api_key on a provider whose ID already exists
// means "keep the stored key" — the admin UI sends mask-placeholder
// rows back and we must not wipe a real key when the user never typed
// a new one.
func (h *Handler) putLLM(c *gin.Context) {
	var v LLM
	if err := c.ShouldBindJSON(&v); err != nil {
		httpx.BadRequest(c, "invalid request")
		return
	}

	// Validate first so a bad payload doesn't touch state.
	seen := map[string]struct{}{}
	for i := range v.Providers {
		p := &v.Providers[i]
		p.ID = strings.TrimSpace(p.ID)
		p.Name = strings.TrimSpace(p.Name)
		p.Kind = strings.TrimSpace(p.Kind)
		p.BaseURL = strings.TrimSpace(p.BaseURL)
		if p.ID == "" || p.Name == "" {
			httpx.ValidationError(c, "invalid_llm_provider", "provider id and name are required")
			return
		}
		if p.Kind != LLMKindOpenAI && p.Kind != LLMKindAnthropic {
			httpx.ValidationError(c, "invalid_llm_kind", "kind must be openai or anthropic")
			return
		}
		if _, dup := seen[p.ID]; dup {
			httpx.ValidationError(c, "duplicate_llm_id", "provider id must be unique")
			return
		}
		seen[p.ID] = struct{}{}
	}

	// Preserve existing API keys where the caller sent a masked
	// placeholder or empty value. This is the counterpart to the
	// masking done by MaskedLLM/MaskedSnapshot — round-trip safe.
	existing, err := h.svc.GetLLM()
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	byID := map[string]LLMProvider{}
	for _, p := range existing.Providers {
		byID[p.ID] = p
	}
	for i := range v.Providers {
		p := &v.Providers[i]
		if p.APIKey == "" || p.APIKey == "••••••••" {
			if prev, ok := byID[p.ID]; ok {
				p.APIKey = prev.APIKey
			} else {
				p.APIKey = ""
			}
		}
	}

	uid, _ := auth.CurrentUserID(c)
	if err := h.svc.SaveLLM(v, uid); err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	h.record(c, "llm")

	// Return the masked view so the admin UI keeps fresh masks on save.
	masked, err := h.svc.MaskedLLM()
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	httpx.OK(c, masked)
}
