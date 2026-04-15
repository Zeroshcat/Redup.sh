package report

import (
	"errors"
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/redup/backend/internal/audit"
	"github.com/redup/backend/internal/auth"
	httpx "github.com/redup/backend/internal/http"
)

// UserLookup is the narrow interface the handler needs to snapshot reporter
// and handler usernames at submit/handle time. Wired from main.go using the
// user service to keep this package free of cross-module imports.
type UserLookup interface {
	UsernameByID(id int64) (string, error)
}

type Handler struct {
	svc   *Service
	users UserLookup
	audit *audit.Service
}

func NewHandler(svc *Service, users UserLookup) *Handler {
	return &Handler{svc: svc, users: users}
}

func (h *Handler) SetAudit(a *audit.Service) { h.audit = a }

func (h *Handler) record(c *gin.Context, in audit.Input) {
	if h.audit != nil {
		h.audit.Record(c, in)
	}
}

func (h *Handler) RegisterUser(r *gin.RouterGroup) {
	// Caller must already apply auth.RequireAuth on this group.
	r.POST("/reports", h.submit)
}

func (h *Handler) RegisterAdmin(r *gin.RouterGroup) {
	r.GET("/reports", h.list)
	r.GET("/reports/counts", h.counts)
	r.POST("/reports/:id/resolve", h.resolve)
	r.POST("/reports/:id/dismiss", h.dismiss)
}

type submitReq struct {
	TargetType  string `json:"target_type" binding:"required"`
	TargetID    int64  `json:"target_id" binding:"required"`
	TargetTitle string `json:"target_title"`
	Reason      string `json:"reason" binding:"required"`
	Description string `json:"description"`
}

func (h *Handler) submit(c *gin.Context) {
	uid, _ := auth.CurrentUserID(c)
	if uid == 0 {
		httpx.Unauthorized(c, "auth required")
		return
	}
	var req submitReq
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.BadRequest(c, "invalid request")
		return
	}
	username, _ := h.users.UsernameByID(uid)
	rep, err := h.svc.Submit(SubmitInput{
		ReporterID:       uid,
		ReporterUsername: username,
		TargetType:       req.TargetType,
		TargetID:         req.TargetID,
		TargetTitle:      req.TargetTitle,
		Reason:           req.Reason,
		Description:      req.Description,
	})
	if err != nil {
		h.writeError(c, err)
		return
	}
	httpx.Created(c, rep)
}

func (h *Handler) list(c *gin.Context) {
	opts := ListOptions{
		Status: c.Query("status"),
		Limit:  atoiOr(c.Query("limit"), 50),
		Offset: atoiOr(c.Query("offset"), 0),
	}
	items, err := h.svc.List(opts)
	if err != nil {
		h.writeError(c, err)
		return
	}
	httpx.OK(c, items)
}

func (h *Handler) counts(c *gin.Context) {
	counts, err := h.svc.Counts()
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	httpx.OK(c, counts)
}

type handleReq struct {
	Note string `json:"note"`
}

func (h *Handler) resolve(c *gin.Context) {
	h.handle(c, true)
}

func (h *Handler) dismiss(c *gin.Context) {
	h.handle(c, false)
}

func (h *Handler) handle(c *gin.Context, resolve bool) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		httpx.BadRequest(c, "invalid id")
		return
	}
	var req handleReq
	if err := c.ShouldBindJSON(&req); err != nil {
		// note is optional — accept empty body
		req = handleReq{}
	}
	uid, _ := auth.CurrentUserID(c)
	username, _ := h.users.UsernameByID(uid)
	in := HandleInput{HandlerID: uid, HandlerUsername: username, Note: req.Note}

	var rep *Report
	if resolve {
		rep, err = h.svc.Resolve(id, in)
	} else {
		rep, err = h.svc.Dismiss(id, in)
	}
	if err != nil {
		h.writeError(c, err)
		return
	}
	action := "report.resolve"
	if !resolve {
		action = "report.dismiss"
	}
	h.record(c, audit.Input{
		Action:      action,
		TargetType:  "report",
		TargetID:    rep.ID,
		TargetLabel: rep.TargetTitle,
		Detail:      req.Note,
	})
	httpx.OK(c, rep)
}

func (h *Handler) writeError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, ErrInvalidTarget):
		httpx.ValidationError(c, "invalid_target", "target type/id is invalid")
	case errors.Is(err, ErrInvalidReason):
		httpx.ValidationError(c, "invalid_reason", "reason is not in the allowed set")
	case errors.Is(err, ErrInvalidStatus):
		httpx.ValidationError(c, "invalid_status", "status filter is invalid")
	case errors.Is(err, ErrDescriptionLong):
		httpx.ValidationError(c, "description_too_long", "description must be ≤ 500 characters")
	case errors.Is(err, ErrDuplicate):
		httpx.Conflict(c, "report_duplicate", "you already have a pending report on this target")
	case errors.Is(err, ErrReportNotFound):
		httpx.NotFound(c, "report not found")
	case errors.Is(err, ErrAlreadyHandled):
		httpx.Conflict(c, "report_already_handled", "report has already been handled")
	default:
		httpx.Internal(c, "internal error")
	}
}

func atoiOr(s string, fallback int) int {
	if s == "" {
		return fallback
	}
	n, err := strconv.Atoi(s)
	if err != nil {
		return fallback
	}
	return n
}
