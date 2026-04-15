package notification

import (
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/redup/backend/internal/auth"
	httpx "github.com/redup/backend/internal/http"
)

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// Register mounts the user-facing endpoints. Caller must apply auth middleware.
func (h *Handler) Register(r *gin.RouterGroup) {
	r.GET("/notifications", h.list)
	r.GET("/notifications/unread-count", h.unreadCount)
	r.POST("/notifications/:id/read", h.markRead)
	r.POST("/notifications/read-all", h.markAllRead)
}

func (h *Handler) list(c *gin.Context) {
	uid, _ := auth.CurrentUserID(c)
	if uid == 0 {
		httpx.Unauthorized(c, "auth required")
		return
	}
	opts := ListOptions{
		UserID:     uid,
		Type:       c.Query("type"),
		UnreadOnly: c.Query("unread") == "1" || c.Query("unread") == "true",
		Limit:      atoiOr(c.Query("limit"), 100),
		Offset:     atoiOr(c.Query("offset"), 0),
	}
	items, err := h.svc.List(opts)
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	httpx.OK(c, items)
}

func (h *Handler) unreadCount(c *gin.Context) {
	uid, _ := auth.CurrentUserID(c)
	if uid == 0 {
		httpx.Unauthorized(c, "auth required")
		return
	}
	n, err := h.svc.CountUnread(uid)
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	httpx.OK(c, gin.H{"unread": n})
}

func (h *Handler) markRead(c *gin.Context) {
	uid, _ := auth.CurrentUserID(c)
	if uid == 0 {
		httpx.Unauthorized(c, "auth required")
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		httpx.BadRequest(c, "invalid id")
		return
	}
	if err := h.svc.MarkRead(uid, id); err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	httpx.NoContent(c)
}

func (h *Handler) markAllRead(c *gin.Context) {
	uid, _ := auth.CurrentUserID(c)
	if uid == 0 {
		httpx.Unauthorized(c, "auth required")
		return
	}
	if err := h.svc.MarkAllRead(uid); err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	httpx.NoContent(c)
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

// ---------- Admin ----------

// RegisterAdmin mounts the admin inspection surface. Caller applies
// RequireAuth + RequireRole(admin) on the group.
func (h *Handler) RegisterAdmin(r *gin.RouterGroup) {
	r.GET("/notifications", h.adminList)
	r.GET("/notifications/stats", h.adminStats)
}

type adminListResp struct {
	Items []Notification `json:"items"`
	Total int64          `json:"total"`
}

func (h *Handler) adminList(c *gin.Context) {
	opts := AdminListOptions{
		Type:       c.Query("type"),
		UnreadOnly: c.Query("unread") == "1" || c.Query("unread") == "true",
		Limit:      atoiOr(c.Query("limit"), 100),
		Offset:     atoiOr(c.Query("offset"), 0),
	}
	if v := c.Query("recipient_id"); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil {
			opts.RecipientID = n
		}
	}
	if v := c.Query("actor_id"); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil {
			opts.ActorUserID = n
		}
	}
	items, total, err := h.svc.AdminList(opts)
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	httpx.OK(c, adminListResp{Items: items, Total: total})
}

func (h *Handler) adminStats(c *gin.Context) {
	stats, err := h.svc.StatsByType()
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	httpx.OK(c, gin.H{"items": stats})
}
