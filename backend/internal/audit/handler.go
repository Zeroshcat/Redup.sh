package audit

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
	r.GET("/audit", h.list)
}

type ListResp struct {
	Items []Log `json:"items"`
	Total int64 `json:"total"`
}

func (h *Handler) list(c *gin.Context) {
	opts := ListOptions{
		Action:     c.Query("action"),
		TargetType: c.Query("target_type"),
		Limit:      atoiOr(c.Query("limit"), 100),
		Offset:     atoiOr(c.Query("offset"), 0),
	}
	if v := c.Query("actor_id"); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil {
			opts.ActorID = n
		}
	}
	items, total, err := h.svc.List(opts)
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	httpx.OK(c, ListResp{Items: items, Total: total})
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
