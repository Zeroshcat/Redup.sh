package anon

import (
	"strconv"

	"github.com/gin-gonic/gin"

	httpx "github.com/redup/backend/internal/http"
)

// AuditRecorder is the narrow interface the anon handler needs to write an
// operator-action log to the platform audit trail. Every deanonymization
// query is recorded — the UI explicitly warns admins about this to keep the
// "前台匿名、后台可控" contract honest.
type AuditRecorder interface {
	Record(c *gin.Context, action, detail string)
}

type Handler struct {
	svc      *Service
	recorder AuditRecorder
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// SetAuditRecorder wires the platform audit service in from main.go. The
// handler is usable without one (falls back to a no-op record) so early
// boot ordering stays flexible.
func (h *Handler) SetAuditRecorder(r AuditRecorder) { h.recorder = r }

func (h *Handler) RegisterAdmin(r *gin.RouterGroup) {
	r.GET("/anon/audit", h.searchAudit)
}

type AuditListResp struct {
	Items []AuditSearchRow `json:"items"`
}

func (h *Handler) searchAudit(c *gin.Context) {
	query := c.Query("q")
	limit := 100
	if v := c.Query("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			limit = n
		}
	}

	rows, err := h.svc.SearchAudit(query, limit)
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}

	// Record one audit entry per query regardless of result count. Detail
	// captures the search string and number of matches so post-hoc review
	// can distinguish "admin was browsing" from "admin targeted one user".
	if h.recorder != nil {
		detail := "q=" + query + " hits=" + strconv.Itoa(len(rows))
		h.recorder.Record(c, "anon.audit.search", detail)
	}

	httpx.OK(c, AuditListResp{Items: rows})
}
