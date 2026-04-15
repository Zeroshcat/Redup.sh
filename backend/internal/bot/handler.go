package bot

import (
	"errors"
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/redup/backend/internal/audit"
	"github.com/redup/backend/internal/auth"
	httpx "github.com/redup/backend/internal/http"
)

type Handler struct {
	svc   *Service
	jwt   *auth.JWTManager
	audit *audit.Service
}

func NewHandler(svc *Service, jwt *auth.JWTManager) *Handler {
	return &Handler{svc: svc, jwt: jwt}
}

func (h *Handler) SetAudit(a *audit.Service) { h.audit = a }

func (h *Handler) record(c *gin.Context, in audit.Input) {
	if h.audit != nil {
		h.audit.Record(c, in)
	}
}

func (h *Handler) Register(r *gin.RouterGroup) {
	// Public list and detail with optional auth so owners see their own
	// inactive bots.
	pub := r.Group("")
	pub.Use(auth.OptionalAuth(h.jwt))
	pub.GET("/bots", h.list)
	pub.GET("/bots/:slug", h.bySlug)

	authed := r.Group("")
	authed.Use(auth.RequireAuth(h.jwt))
	authed.POST("/bots", h.create)
	authed.PUT("/bots/:slug", h.update)
	authed.DELETE("/bots/:slug", h.deleteOwn)
	authed.POST("/topics/:id/summon-bot", h.summon)

	authed.GET("/bots/:slug/tokens", h.listTokens)
	authed.POST("/bots/:slug/tokens", h.issueToken)
	authed.DELETE("/bots/:slug/tokens/:token_id", h.deleteToken)
}

// resolveBotForOwner loads a bot by slug and verifies the caller is its owner.
// Used by the token CRUD endpoints.
func (h *Handler) resolveBotForOwner(c *gin.Context) (*Bot, bool) {
	uid, _ := auth.CurrentUserID(c)
	b, err := h.svc.repo.BySlug(c.Param("slug"))
	if err != nil {
		httpx.Internal(c, err.Error())
		return nil, false
	}
	if b == nil {
		httpx.NotFound(c, "bot not found")
		return nil, false
	}
	if b.OwnerUserID != uid {
		httpx.Forbidden(c, "not bot owner")
		return nil, false
	}
	return b, true
}

type issueTokenReq struct {
	Name string `json:"name"`
}

type issueTokenResp struct {
	Token string    `json:"token"`
	Row   *APIToken `json:"row"`
}

func (h *Handler) issueToken(c *gin.Context) {
	b, ok := h.resolveBotForOwner(c)
	if !ok {
		return
	}
	var req issueTokenReq
	_ = c.ShouldBindJSON(&req)
	out, err := h.svc.IssueToken(b.ID, req.Name)
	if err != nil {
		h.writeError(c, err)
		return
	}
	h.record(c, audit.Input{
		Action:      "bot.token.issue",
		TargetType:  "bot",
		TargetID:    b.ID,
		TargetLabel: b.Name,
		Detail:      out.Row.Prefix,
	})
	httpx.Created(c, issueTokenResp{Token: out.Token, Row: out.Row})
}

func (h *Handler) listTokens(c *gin.Context) {
	b, ok := h.resolveBotForOwner(c)
	if !ok {
		return
	}
	rows, err := h.svc.ListTokens(b.ID)
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	httpx.OK(c, rows)
}

func (h *Handler) deleteToken(c *gin.Context) {
	b, ok := h.resolveBotForOwner(c)
	if !ok {
		return
	}
	tokenID, err := strconv.ParseInt(c.Param("token_id"), 10, 64)
	if err != nil {
		httpx.BadRequest(c, "invalid token id")
		return
	}
	if err := h.svc.DeleteToken(b.ID, tokenID); err != nil {
		h.writeError(c, err)
		return
	}
	h.record(c, audit.Input{
		Action:      "bot.token.revoke",
		TargetType:  "bot",
		TargetID:    b.ID,
		TargetLabel: b.Name,
	})
	httpx.NoContent(c)
}

type summonReq struct {
	BotSlug string `json:"bot_slug" binding:"required"`
}

func (h *Handler) summon(c *gin.Context) {
	uid, _ := auth.CurrentUserID(c)
	topicID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		httpx.BadRequest(c, "invalid id")
		return
	}
	var req summonReq
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.BadRequest(c, "invalid request")
		return
	}
	if err := h.svc.ManualInvoke(req.BotSlug, topicID, uid); err != nil {
		switch {
		case errors.Is(err, ErrBotNotFound):
			httpx.NotFound(c, "bot not found")
		default:
			httpx.Fail(c, 502, "bot_invoke_failed", err.Error())
		}
		return
	}
	h.record(c, audit.Input{
		Action:      "bot.summon",
		TargetType:  "bot",
		TargetID:    topicID,
		TargetLabel: "@" + req.BotSlug,
	})
	httpx.NoContent(c)
}

// RegisterAdmin mounts admin endpoints. Caller must apply auth + admin rbac.
func (h *Handler) RegisterAdmin(r *gin.RouterGroup) {
	r.GET("/bots", h.adminList)
	r.POST("/bots/:id/approve", h.adminApprove)
	r.POST("/bots/:id/reject", h.adminReject)
	r.POST("/bots/:id/suspend", h.adminSuspend)
	r.POST("/bots/:id/feature", h.adminFeature)
	r.POST("/bots/:id/moderator", h.adminModerator)
	r.DELETE("/bots/:id", h.adminDelete)
	r.GET("/bot-logs", h.adminLogs)
	r.GET("/bot-logs/stats", h.adminLogStats)
}

type callLogResp struct {
	Items []CallLog `json:"items"`
	Total int64     `json:"total"`
}

func (h *Handler) adminLogs(c *gin.Context) {
	opts := CallLogListOptions{
		Status:  c.Query("status"),
		BotSlug: c.Query("bot_slug"),
		Limit:   atoiOr(c.Query("limit"), 100),
		Offset:  atoiOr(c.Query("offset"), 0),
	}
	items, total, err := h.svc.ListCalls(opts)
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	httpx.OK(c, callLogResp{Items: items, Total: total})
}

func (h *Handler) adminLogStats(c *gin.Context) {
	stats, err := h.svc.CallStats()
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	httpx.OK(c, stats)
}

type botReq struct {
	Slug          string `json:"slug"`
	Name          string `json:"name" binding:"required"`
	Description   string `json:"description" binding:"required"`
	AvatarURL     string `json:"avatar_url"`
	ModelProvider string `json:"model_provider"`
	ModelName     string `json:"model_name"`
	WebhookURL    string `json:"webhook_url" binding:"required"`
	APIKey        string `json:"api_key"`
	SystemPrompt  string `json:"system_prompt"`
	Tags          string `json:"tags"`
}

func (req botReq) toInput() Input {
	return Input{
		Slug:          req.Slug,
		Name:          req.Name,
		Description:   req.Description,
		AvatarURL:     req.AvatarURL,
		ModelProvider: req.ModelProvider,
		ModelName:     req.ModelName,
		WebhookURL:    req.WebhookURL,
		APIKey:        req.APIKey,
		SystemPrompt:  req.SystemPrompt,
		Tags:          req.Tags,
	}
}

func (h *Handler) list(c *gin.Context) {
	opts := ListOptions{
		Limit:  atoiOr(c.Query("limit"), 50),
		Offset: atoiOr(c.Query("offset"), 0),
	}
	items, total, err := h.svc.ListPublic(opts)
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	httpx.OK(c, listResp{Items: items, Total: total})
}

type listResp struct {
	Items []Bot `json:"items"`
	Total int64 `json:"total"`
}

func (h *Handler) bySlug(c *gin.Context) {
	uid, _ := auth.CurrentUserID(c)
	role, _ := c.Get("user_role")
	isAdmin := role == "admin"
	b, err := h.svc.BySlug(c.Param("slug"), uid, isAdmin)
	if err != nil {
		h.writeError(c, err)
		return
	}
	httpx.OK(c, b)
}

func (h *Handler) create(c *gin.Context) {
	uid, _ := auth.CurrentUserID(c)
	var req botReq
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.BadRequest(c, "invalid request")
		return
	}
	if req.Slug == "" {
		httpx.BadRequest(c, "slug is required")
		return
	}
	b, err := h.svc.Submit(uid, req.toInput())
	if err != nil {
		h.writeError(c, err)
		return
	}
	h.record(c, audit.Input{
		Action:      "bot.create",
		TargetType:  "bot",
		TargetID:    b.ID,
		TargetLabel: b.Name,
	})
	httpx.Created(c, b)
}

func (h *Handler) update(c *gin.Context) {
	b, ok := h.resolveBotForOwner(c)
	if !ok {
		return
	}
	uid, _ := auth.CurrentUserID(c)
	var req botReq
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.BadRequest(c, "invalid request")
		return
	}
	updated, err := h.svc.Update(uid, b.ID, req.toInput())
	if err != nil {
		h.writeError(c, err)
		return
	}
	httpx.OK(c, updated)
}

func (h *Handler) deleteOwn(c *gin.Context) {
	b, ok := h.resolveBotForOwner(c)
	if !ok {
		return
	}
	uid, _ := auth.CurrentUserID(c)
	if err := h.svc.Delete(uid, false, b.ID); err != nil {
		h.writeError(c, err)
		return
	}
	httpx.NoContent(c)
}

// ---------- Admin ----------

func (h *Handler) adminList(c *gin.Context) {
	opts := ListOptions{
		Status: c.Query("status"),
		Limit:  atoiOr(c.Query("limit"), 100),
		Offset: atoiOr(c.Query("offset"), 0),
	}
	items, total, err := h.svc.ListAdmin(opts)
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	httpx.OK(c, listResp{Items: items, Total: total})
}

type noteReq struct {
	Note string `json:"note"`
}

func (h *Handler) adminApprove(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		httpx.BadRequest(c, "invalid id")
		return
	}
	uid, _ := auth.CurrentUserID(c)
	b, err := h.svc.Approve(uid, id)
	if err != nil {
		h.writeError(c, err)
		return
	}
	h.record(c, audit.Input{
		Action:      "bot.approve",
		TargetType:  "bot",
		TargetID:    b.ID,
		TargetLabel: b.Name,
	})
	httpx.OK(c, b)
}

func (h *Handler) adminReject(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		httpx.BadRequest(c, "invalid id")
		return
	}
	var req noteReq
	if err := c.ShouldBindJSON(&req); err != nil {
		req = noteReq{}
	}
	uid, _ := auth.CurrentUserID(c)
	b, err := h.svc.Reject(uid, id, req.Note)
	if err != nil {
		h.writeError(c, err)
		return
	}
	h.record(c, audit.Input{
		Action:      "bot.reject",
		TargetType:  "bot",
		TargetID:    b.ID,
		TargetLabel: b.Name,
		Detail:      req.Note,
	})
	httpx.OK(c, b)
}

func (h *Handler) adminSuspend(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		httpx.BadRequest(c, "invalid id")
		return
	}
	var req noteReq
	if err := c.ShouldBindJSON(&req); err != nil {
		req = noteReq{}
	}
	uid, _ := auth.CurrentUserID(c)
	b, err := h.svc.Suspend(uid, id, req.Note)
	if err != nil {
		h.writeError(c, err)
		return
	}
	h.record(c, audit.Input{
		Action:      "bot.suspend",
		TargetType:  "bot",
		TargetID:    b.ID,
		TargetLabel: b.Name,
		Detail:      req.Note,
	})
	httpx.OK(c, b)
}

type featureReq struct {
	Featured bool `json:"featured"`
}

type moderatorReq struct {
	Enabled bool `json:"enabled"`
}

func (h *Handler) adminModerator(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		httpx.BadRequest(c, "invalid id")
		return
	}
	var req moderatorReq
	if err := c.ShouldBindJSON(&req); err != nil {
		req = moderatorReq{Enabled: true}
	}
	b, err := h.svc.SetModerator(id, req.Enabled)
	if err != nil {
		h.writeError(c, err)
		return
	}
	action := "bot.moderator.enable"
	if !req.Enabled {
		action = "bot.moderator.disable"
	}
	h.record(c, audit.Input{
		Action:      action,
		TargetType:  "bot",
		TargetID:    b.ID,
		TargetLabel: b.Name,
	})
	httpx.OK(c, b)
}

func (h *Handler) adminFeature(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		httpx.BadRequest(c, "invalid id")
		return
	}
	var req featureReq
	if err := c.ShouldBindJSON(&req); err != nil {
		req = featureReq{Featured: true}
	}
	b, err := h.svc.Feature(id, req.Featured)
	if err != nil {
		h.writeError(c, err)
		return
	}
	h.record(c, audit.Input{
		Action:      "bot.feature",
		TargetType:  "bot",
		TargetID:    b.ID,
		TargetLabel: b.Name,
	})
	httpx.OK(c, b)
}

func (h *Handler) adminDelete(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		httpx.BadRequest(c, "invalid id")
		return
	}
	uid, _ := auth.CurrentUserID(c)
	b, _ := h.svc.ByID(id)
	if err := h.svc.Delete(uid, true, id); err != nil {
		h.writeError(c, err)
		return
	}
	label := ""
	if b != nil {
		label = b.Name
	}
	h.record(c, audit.Input{
		Action:      "bot.delete",
		TargetType:  "bot",
		TargetID:    id,
		TargetLabel: label,
	})
	httpx.NoContent(c)
}

func (h *Handler) writeError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, ErrBotNotFound):
		httpx.NotFound(c, "bot not found")
	case errors.Is(err, ErrSlugTaken):
		httpx.Conflict(c, "bot_slug_taken", "slug already taken")
	case errors.Is(err, ErrInvalidSlug):
		httpx.ValidationError(c, "invalid_slug", "slug must be 3-32 lowercase letters, digits or hyphens")
	case errors.Is(err, ErrInvalidName):
		httpx.ValidationError(c, "invalid_name", "name must be 2-32 characters")
	case errors.Is(err, ErrInvalidDesc):
		httpx.ValidationError(c, "invalid_description", "description must be 10-512 characters")
	case errors.Is(err, ErrInvalidWebhook):
		httpx.ValidationError(c, "invalid_webhook", "webhook url is required and must be http(s)://")
	case errors.Is(err, ErrInvalidStatus):
		httpx.Conflict(c, "invalid_status_transition", "status transition is not allowed")
	case errors.Is(err, ErrForbidden):
		httpx.Forbidden(c, "forbidden")
	default:
		httpx.Internal(c, err.Error())
	}
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
