package moderation

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
	r.GET("/moderation", h.list)
	r.GET("/moderation/counts", h.counts)
	r.POST("/moderation/:id/resolve", h.resolve)
}

func (h *Handler) resolve(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		httpx.BadRequest(c, "invalid id")
		return
	}
	if err := h.svc.MarkResolved(id); err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	httpx.NoContent(c)
}

type listResp struct {
	Items []Log `json:"items"`
	Total int64 `json:"total"`
}

func (h *Handler) list(c *gin.Context) {
	opts := ListOptions{
		Verdict: c.Query("verdict"),
		Limit:   atoiOr(c.Query("limit"), 100),
		Offset:  atoiOr(c.Query("offset"), 0),
	}
	items, total, err := h.svc.List(opts)
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	httpx.OK(c, listResp{Items: items, Total: total})
}

func (h *Handler) counts(c *gin.Context) {
	stats, err := h.svc.Counts()
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	httpx.OK(c, stats)
}

func atoiOr(s string, def int) int {
	if s == "" {
		return def
	}
	n, err := strconv.Atoi(s)
	if err != nil {
		return def
	}
	return n
}
