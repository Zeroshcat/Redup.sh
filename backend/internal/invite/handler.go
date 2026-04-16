package invite

import (
	"errors"
	"strconv"
	"time"

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

func (h *Handler) record(c *gin.Context, in audit.Input) {
	if h.audit != nil {
		h.audit.Record(c, in)
	}
}

// RegisterAdmin mounts admin invite-code endpoints. Auth + admin RBAC
// must already be applied by the caller.
func (h *Handler) RegisterAdmin(r *gin.RouterGroup) {
	r.GET("/invites", h.list)
	r.POST("/invites", h.generate)
	r.GET("/invites/:id/usages", h.usages)
	r.DELETE("/invites/:id", h.delete)
}

type generateReq struct {
	MaxUses       int    `json:"max_uses"`
	Note          string `json:"note"`
	ExpiresInHours int   `json:"expires_in_hours"`
}

func (h *Handler) generate(c *gin.Context) {
	var req generateReq
	if err := c.ShouldBindJSON(&req); err != nil {
		req = generateReq{}
	}
	uid, _ := auth.CurrentUserID(c)
	role, _ := c.Get("user_role")
	_ = role

	var dur time.Duration
	if req.ExpiresInHours > 0 {
		dur = time.Duration(req.ExpiresInHours) * time.Hour
	}

	// Look up username for the record.
	username := ""
	if v, ok := c.Get("user_role"); ok {
		_ = v
	}

	code, err := h.svc.Generate(uid, username, req.MaxUses, req.Note, dur)
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	h.record(c, audit.Input{
		Action:      "invite.generate",
		TargetType:  "invite_code",
		TargetID:    code.ID,
		TargetLabel: code.Code,
	})
	httpx.Created(c, code)
}

func (h *Handler) list(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	items, total, err := h.svc.List(ListOptions{Limit: limit, Offset: offset})
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	httpx.OK(c, gin.H{"items": items, "total": total})
}

func (h *Handler) usages(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		httpx.BadRequest(c, "invalid id")
		return
	}
	items, err := h.svc.Usages(id)
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	httpx.OK(c, items)
}

func (h *Handler) delete(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		httpx.BadRequest(c, "invalid id")
		return
	}
	if err := h.svc.Delete(id); err != nil {
		if errors.Is(err, ErrCodeNotFound) {
			httpx.NotFound(c, "invite code not found")
			return
		}
		httpx.Internal(c, err.Error())
		return
	}
	h.record(c, audit.Input{
		Action:      "invite.delete",
		TargetType:  "invite_code",
		TargetID:    id,
	})
	httpx.NoContent(c)
}
