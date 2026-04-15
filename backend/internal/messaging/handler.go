package messaging

import (
	"errors"
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
	g := r.Group("/messages")
	g.GET("/conversations", h.listConversations)
	g.GET("/conversations/:other_id", h.openConversation)
	g.GET("/conversations/:other_id/messages", h.listMessages)
	g.POST("/conversations/:other_id", h.send)
	g.POST("/conversations/:other_id/read", h.markRead)
	g.GET("/unread-count", h.unreadCount)
}

func (h *Handler) listConversations(c *gin.Context) {
	uid, _ := auth.CurrentUserID(c)
	if uid == 0 {
		httpx.Unauthorized(c, "auth required")
		return
	}
	items, err := h.svc.ListByUser(uid, 100)
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	if items == nil {
		items = []ConversationView{}
	}
	httpx.OK(c, items)
}

func (h *Handler) openConversation(c *gin.Context) {
	uid, _ := auth.CurrentUserID(c)
	otherID, err := strconv.ParseInt(c.Param("other_id"), 10, 64)
	if err != nil {
		httpx.BadRequest(c, "invalid user id")
		return
	}
	conv, err := h.svc.OpenConversation(uid, otherID)
	if err != nil {
		h.writeError(c, err)
		return
	}
	httpx.OK(c, conv)
}

func (h *Handler) listMessages(c *gin.Context) {
	uid, _ := auth.CurrentUserID(c)
	otherID, err := strconv.ParseInt(c.Param("other_id"), 10, 64)
	if err != nil {
		httpx.BadRequest(c, "invalid user id")
		return
	}
	conv, err := h.svc.OpenConversation(uid, otherID)
	if err != nil {
		h.writeError(c, err)
		return
	}
	before := int64(0)
	if v := c.Query("before"); v != "" {
		before, _ = strconv.ParseInt(v, 10, 64)
	}
	limit := 50
	if v := c.Query("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 100 {
			limit = n
		}
	}
	msgs, err := h.svc.Messages(uid, conv.ID, before, limit)
	if err != nil {
		h.writeError(c, err)
		return
	}
	httpx.OK(c, gin.H{"conversation": conv, "messages": msgs})
}

type sendReq struct {
	Content string `json:"content" binding:"required"`
}

func (h *Handler) send(c *gin.Context) {
	uid, _ := auth.CurrentUserID(c)
	otherID, err := strconv.ParseInt(c.Param("other_id"), 10, 64)
	if err != nil {
		httpx.BadRequest(c, "invalid user id")
		return
	}
	var req sendReq
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.BadRequest(c, "invalid request")
		return
	}
	conv, msg, err := h.svc.Send(uid, otherID, req.Content)
	if err != nil {
		h.writeError(c, err)
		return
	}
	httpx.Created(c, gin.H{"conversation": conv, "message": msg})
}

func (h *Handler) markRead(c *gin.Context) {
	uid, _ := auth.CurrentUserID(c)
	otherID, err := strconv.ParseInt(c.Param("other_id"), 10, 64)
	if err != nil {
		httpx.BadRequest(c, "invalid user id")
		return
	}
	conv, err := h.svc.OpenConversation(uid, otherID)
	if err != nil {
		h.writeError(c, err)
		return
	}
	if err := h.svc.MarkRead(uid, conv.ID); err != nil {
		h.writeError(c, err)
		return
	}
	httpx.NoContent(c)
}

func (h *Handler) unreadCount(c *gin.Context) {
	uid, _ := auth.CurrentUserID(c)
	n, err := h.svc.CountUnread(uid)
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	httpx.OK(c, gin.H{"unread": n})
}

// ---------- Admin ----------

// RegisterAdmin mounts admin inspection endpoints under the caller's group
// (already wrapped in RequireAuth + RequireRole(admin)).
func (h *Handler) RegisterAdmin(r *gin.RouterGroup) {
	r.GET("/messages/conversations", h.adminListConversations)
	r.GET("/messages/conversations/:id", h.adminConversationDetail)
}

type adminConvListResp struct {
	Items []AdminConversationView `json:"items"`
	Total int64                   `json:"total"`
}

func (h *Handler) adminListConversations(c *gin.Context) {
	opts := AdminListOptions{
		Limit:  100,
		Offset: 0,
	}
	if v := c.Query("participant_id"); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil {
			opts.ParticipantID = n
		}
	}
	if v := c.Query("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			opts.Limit = n
		}
	}
	if v := c.Query("offset"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 {
			opts.Offset = n
		}
	}
	items, total, err := h.svc.AdminListConversations(opts)
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	httpx.OK(c, adminConvListResp{Items: items, Total: total})
}

func (h *Handler) adminConversationDetail(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		httpx.ValidationError(c, "invalid_input", "bad id")
		return
	}
	detail, err := h.svc.AdminConversationDetail(id)
	if err != nil {
		if errors.Is(err, ErrNotParticipant) {
			httpx.NotFound(c, "conversation not found")
			return
		}
		httpx.Internal(c, err.Error())
		return
	}
	httpx.OK(c, detail)
}

func (h *Handler) writeError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, ErrEmpty):
		httpx.ValidationError(c, "empty_message", "message content is empty")
	case errors.Is(err, ErrTooLong):
		httpx.ValidationError(c, "message_too_long", "message must be ≤ 2000 characters")
	case errors.Is(err, ErrSelfMessage):
		httpx.ValidationError(c, "self_message", "cannot message yourself")
	case errors.Is(err, ErrUserMissing):
		httpx.NotFound(c, "recipient not found")
	case errors.Is(err, ErrNotParticipant):
		httpx.Forbidden(c, "not a participant")
	default:
		httpx.Internal(c, err.Error())
	}
}
