package contentfilter

import (
	"errors"
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/redup/backend/internal/audit"
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

func (h *Handler) record(c *gin.Context, action, label string) {
	if h.audit != nil {
		h.audit.Record(c, audit.Input{
			Action:      action,
			TargetType:  "filter_word",
			TargetLabel: label,
		})
	}
}

// RegisterAdmin mounts the CRUD endpoints. Caller applies auth + admin rbac.
func (h *Handler) RegisterAdmin(r *gin.RouterGroup) {
	r.GET("/content-filter", h.list)
	r.POST("/content-filter", h.create)
	r.PUT("/content-filter/:id", h.update)
	r.DELETE("/content-filter/:id", h.remove)
}

type wordReq struct {
	Word     string `json:"word" binding:"required"`
	Severity string `json:"severity"`
	Note     string `json:"note"`
	Enabled  *bool  `json:"enabled"`
}

func (h *Handler) list(c *gin.Context) {
	items, err := h.svc.List()
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	httpx.OK(c, items)
}

func (h *Handler) create(c *gin.Context) {
	var req wordReq
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.BadRequest(c, "invalid request")
		return
	}
	w := &Word{Word: req.Word, Severity: req.Severity, Note: req.Note, Enabled: true}
	if req.Enabled != nil {
		w.Enabled = *req.Enabled
	}
	if err := h.svc.Create(w); err != nil {
		h.writeError(c, err)
		return
	}
	h.record(c, "filter.create", w.Word)
	httpx.Created(c, w)
}

func (h *Handler) update(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		httpx.BadRequest(c, "invalid id")
		return
	}
	current, err := h.svc.ByID(id)
	if err != nil || current == nil {
		httpx.NotFound(c, "word not found")
		return
	}
	var req wordReq
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.BadRequest(c, "invalid request")
		return
	}
	current.Word = req.Word
	current.Severity = req.Severity
	current.Note = req.Note
	if req.Enabled != nil {
		current.Enabled = *req.Enabled
	}
	if err := h.svc.Update(current); err != nil {
		h.writeError(c, err)
		return
	}
	h.record(c, "filter.update", current.Word)
	httpx.OK(c, current)
}

func (h *Handler) remove(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		httpx.BadRequest(c, "invalid id")
		return
	}
	current, _ := h.svc.ByID(id)
	if err := h.svc.Delete(id); err != nil {
		h.writeError(c, err)
		return
	}
	label := ""
	if current != nil {
		label = current.Word
	}
	h.record(c, "filter.delete", label)
	httpx.NoContent(c)
}

func (h *Handler) writeError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, ErrNotFound):
		httpx.NotFound(c, "word not found")
	case errors.Is(err, ErrEmptyWord):
		httpx.ValidationError(c, "empty_word", "word cannot be empty")
	case errors.Is(err, ErrWordTooLong):
		httpx.ValidationError(c, "word_too_long", "word must be ≤64 characters")
	case errors.Is(err, ErrInvalidLevel):
		httpx.ValidationError(c, "invalid_severity", "severity must be block or warn")
	default:
		httpx.Internal(c, err.Error())
	}
}
