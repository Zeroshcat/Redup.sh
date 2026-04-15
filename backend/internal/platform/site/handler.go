package site

import (
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
type PublicInfo struct {
	Name             string `json:"name"`
	Tagline          string `json:"tagline"`
	Description      string `json:"description"`
	LogoURL          string `json:"logo_url,omitempty"`
	Language         string `json:"language"`
	RegistrationMode string `json:"registration_mode"`
	AnonPrefix       string `json:"anon_prefix"`
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
	httpx.OK(c, PublicInfo{
		Name:             basic.Name,
		Tagline:          basic.Tagline,
		Description:      basic.Description,
		LogoURL:          basic.LogoURL,
		Language:         basic.Language,
		RegistrationMode: reg.Mode,
		AnonPrefix:       anon.Prefix,
	})
}

func (h *Handler) snapshot(c *gin.Context) {
	snap, err := h.svc.Snapshot()
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
