// Package skills exposes a narrow API surface for user bots to call back into
// the platform via their issued bot_api_token. Every endpoint is scoped: the
// middleware verifies the token has the right capability before dispatching.
//
// Calls authored via this surface are attributed to the bot, not the bot
// owner — write operations automatically set is_bot_generated=true.
package skills

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/redup/backend/internal/audit"
	"github.com/redup/backend/internal/bot"
	"github.com/redup/backend/internal/forum"
	httpx "github.com/redup/backend/internal/http"
)

// ContextKeyBotID is set by the bot-token middleware on successful auth.
const (
	ContextKeyBotID  = "skills_bot_id"
	ContextKeyToken  = "skills_token"
)

type Handler struct {
	botSvc   *bot.Service
	forumSvc *forum.Service
	audit    *audit.Service
}

func NewHandler(botSvc *bot.Service, forumSvc *forum.Service, auditSvc *audit.Service) *Handler {
	return &Handler{botSvc: botSvc, forumSvc: forumSvc, audit: auditSvc}
}

// Register mounts the skill routes. Caller must apply the bot-token middleware
// on the group before invoking this.
func (h *Handler) Register(r *gin.RouterGroup) {
	r.GET("/topics/:id", requireScope(bot.ScopePostsRead), h.getTopic)
	r.GET("/topics/:id/posts", requireScope(bot.ScopePostsRead), h.listPosts)
	r.POST("/topics/:id/posts", requireScope(bot.ScopePostsWrite), h.postReply)
	r.GET("/search", requireScope(bot.ScopeSearch), h.search)
}

// RequireBotToken is the middleware factory that turns a bearer token into a
// (*bot.Bot, *bot.APIToken) pair stored on the gin context. Missing or
// invalid tokens are rejected with 401.
func RequireBotToken(botSvc *bot.Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		if header == "" || len(header) < 8 {
			httpx.Unauthorized(c, "missing bot token")
			return
		}
		// Accept "Bearer <token>" or just "<token>".
		token := header
		if len(header) > 7 && (header[:7] == "Bearer " || header[:7] == "bearer ") {
			token = header[7:]
		}
		b, t, err := botSvc.AuthenticateToken(token)
		if err != nil {
			httpx.Fail(c, http.StatusUnauthorized, "bot_token_invalid", err.Error())
			return
		}
		if b == nil || t == nil {
			httpx.Fail(c, http.StatusUnauthorized, "bot_token_invalid", "invalid bot token")
			return
		}
		c.Set(ContextKeyBotID, b.ID)
		c.Set(ContextKeyToken, t)
		c.Next()
	}
}

// requireScope is a per-route guard. The token row was placed on the context
// by RequireBotToken; we just check that it carries the required capability.
func requireScope(want string) gin.HandlerFunc {
	return func(c *gin.Context) {
		v, ok := c.Get(ContextKeyToken)
		if !ok {
			httpx.Forbidden(c, "no bot token on context")
			return
		}
		t, _ := v.(*bot.APIToken)
		if t == nil || !bot.ScopesContains(t.Scopes, want) {
			httpx.Fail(c, http.StatusForbidden, "missing_scope", "token is missing scope: "+want)
			return
		}
		c.Next()
	}
}

func currentBotID(c *gin.Context) int64 {
	v, ok := c.Get(ContextKeyBotID)
	if !ok {
		return 0
	}
	id, _ := v.(int64)
	return id
}

// ---------- Skill handlers ----------

type topicResp struct {
	ID         int64  `json:"id"`
	Title      string `json:"title"`
	Body       string `json:"body"`
	CategoryID int64  `json:"category_id"`
	IsLocked   bool   `json:"is_locked"`
	ReplyCount int    `json:"reply_count"`
}

func (h *Handler) getTopic(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		httpx.BadRequest(c, "invalid id")
		return
	}
	t, err := h.forumSvc.GetTopic(id)
	if err != nil || t == nil {
		httpx.NotFound(c, "topic not found")
		return
	}
	h.recordCall(c, "topic.read", id, t.Title)
	httpx.OK(c, topicResp{
		ID:         t.ID,
		Title:      t.Title,
		Body:       t.Body,
		CategoryID: t.CategoryID,
		IsLocked:   t.IsLocked,
		ReplyCount: t.ReplyCount,
	})
}

type postSummary struct {
	Floor   int    `json:"floor"`
	Author  string `json:"author"`
	Content string `json:"content"`
	IsBot   bool   `json:"is_bot"`
}

func (h *Handler) listPosts(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		httpx.BadRequest(c, "invalid id")
		return
	}
	snap, err := h.forumSvc.LoadTopicForBot(id)
	if err != nil || snap == nil {
		httpx.NotFound(c, "topic not found")
		return
	}
	out := make([]postSummary, 0, len(snap.Posts))
	for _, p := range snap.Posts {
		out = append(out, postSummary{
			Floor:   p.Floor,
			Author:  p.Author,
			Content: p.Content,
			IsBot:   p.IsBot,
		})
	}
	h.recordCall(c, "topic.posts.read", id, snap.Title)
	httpx.OK(c, gin.H{"title": snap.Title, "body": snap.Body, "posts": out})
}

type postReplyReq struct {
	Content string `json:"content" binding:"required"`
}

func (h *Handler) postReply(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		httpx.BadRequest(c, "invalid id")
		return
	}
	var req postReplyReq
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.BadRequest(c, "invalid request")
		return
	}
	botID := currentBotID(c)
	b, err := h.botSvc.ByID(botID)
	if err != nil || b == nil {
		httpx.Internal(c, "bot lookup failed")
		return
	}
	if err := h.forumSvc.PostBotReply(id, b.ID, b.OwnerUserID, req.Content); err != nil {
		httpx.Fail(c, http.StatusBadRequest, "post_failed", err.Error())
		return
	}
	h.recordCall(c, "topic.reply.write", id, b.Name)
	httpx.Created(c, gin.H{"ok": true})
}

func (h *Handler) search(c *gin.Context) {
	q := c.Query("q")
	limit := 20
	if v := c.Query("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 50 {
			limit = n
		}
	}
	results, err := h.forumSvc.SearchTopics(q, limit)
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	h.recordCall(c, "search", 0, q)
	httpx.OK(c, gin.H{"query": q, "results": results})
}

// recordCall writes a single audit row per skill invocation so admins can see
// what each bot is doing.
func (h *Handler) recordCall(c *gin.Context, action string, targetID int64, label string) {
	if h.audit == nil {
		return
	}
	h.audit.Record(c, audit.Input{
		Action:      "skill." + action,
		TargetType:  "skill",
		TargetID:    targetID,
		TargetLabel: label,
		Detail:      "bot_id=" + strconv.FormatInt(currentBotID(c), 10),
	})
}

