package llm

import (
	"strconv"

	"github.com/gin-gonic/gin"

	httpx "github.com/redup/backend/internal/http"
)

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

func (h *Handler) RegisterAdmin(r *gin.RouterGroup) {
	r.GET("/llm/calls", h.adminList)
	r.GET("/llm/stats", h.adminStats)
	r.GET("/llm/providers", h.adminProviders)
}

type listResp struct {
	Items []CallLog `json:"items"`
	Total int64     `json:"total"`
}

func (h *Handler) adminList(c *gin.Context) {
	opts := ListOptions{
		Provider: c.Query("provider"),
		Model:    c.Query("model"),
		Feature:  c.Query("feature"),
		Status:   c.Query("status"),
		Limit:    parseInt(c.Query("limit"), 100),
		Offset:   parseInt(c.Query("offset"), 0),
	}
	items, total, err := h.svc.List(opts)
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	httpx.OK(c, listResp{Items: items, Total: total})
}

func (h *Handler) adminStats(c *gin.Context) {
	stats, err := h.svc.Stats()
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	httpx.OK(c, gin.H{"items": stats})
}

// adminProviders echoes which providers were registered at boot. Useful for
// the admin panel's "connected backends" indicator.
func (h *Handler) adminProviders(c *gin.Context) {
	httpx.OK(c, gin.H{"providers": h.svc.Available()})
}

func parseInt(s string, def int) int {
	if s == "" {
		return def
	}
	n, err := strconv.Atoi(s)
	if err != nil {
		return def
	}
	return n
}
