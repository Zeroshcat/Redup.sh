package forum

import (
	"errors"
	"fmt"
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
	r.GET("/categories", h.listCategories)
	r.GET("/categories/:slug", h.categoryBySlug)
	r.GET("/search", h.search)

	// Public reads with OPTIONAL auth: works without login, but when a token
	// is present we hydrate user_liked / user_bookmarked so the UI can render
	// "已赞/已收藏" state.
	optional := r.Group("")
	optional.Use(auth.OptionalAuth(h.jwt))
	optional.GET("/topics", h.listTopics)
	optional.GET("/topics/:id", h.topicDetail)
	optional.GET("/topics/:id/posts", h.topicPosts)

	r.GET("/users/:username/topics", h.userTopics)
	r.GET("/users/:username/posts", h.userPosts)

	authed := r.Group("")
	authed.Use(auth.RequireAuth(h.jwt))
	authed.GET("/feed", h.feed)
	authed.POST("/topics", h.createTopic)
	authed.POST("/topics/:id/posts", h.createPost)
	authed.POST("/topics/:id/like", h.toggleTopicLike)
	authed.POST("/topics/:id/bookmark", h.toggleBookmark)
	authed.POST("/posts/:id/like", h.togglePostLike)
	authed.PATCH("/topics/:id/body", h.updateTopicBody)
	authed.PATCH("/posts/:id", h.updatePostContent)
}

func currentUserRole(c *gin.Context) string {
	v, ok := c.Get("user_role")
	if !ok {
		return ""
	}
	s, _ := v.(string)
	return s
}

type editBodyReq struct {
	Body string `json:"body" binding:"required"`
}

func (h *Handler) updateTopicBody(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		httpx.BadRequest(c, "invalid id")
		return
	}
	var req editBodyReq
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.BadRequest(c, "invalid request")
		return
	}
	uid, _ := auth.CurrentUserID(c)
	t, err := h.svc.UpdateTopicBody(uid, currentUserRole(c), id, req.Body)
	if err != nil {
		h.writeError(c, err)
		return
	}
	httpx.OK(c, t)
}

type editContentReq struct {
	Content string `json:"content" binding:"required"`
}

func (h *Handler) updatePostContent(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		httpx.BadRequest(c, "invalid id")
		return
	}
	var req editContentReq
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.BadRequest(c, "invalid request")
		return
	}
	uid, _ := auth.CurrentUserID(c)
	p, err := h.svc.UpdatePost(uid, currentUserRole(c), id, req.Content)
	if err != nil {
		h.writeError(c, err)
		return
	}
	httpx.OK(c, p)
}

func (h *Handler) feed(c *gin.Context) {
	uid, _ := auth.CurrentUserID(c)
	if uid == 0 {
		httpx.Unauthorized(c, "auth required")
		return
	}
	limit := atoiOr(c.Query("limit"), 50)
	if limit > 100 {
		limit = 100
	}
	items, err := h.svc.FollowedTopics(uid, limit)
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	if err := h.svc.HydrateTopicsUserState(uid, items); err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	httpx.OK(c, items)
}

func (h *Handler) search(c *gin.Context) {
	q := c.Query("q")
	limit := atoiOr(c.Query("limit"), 30)
	if limit > 50 {
		limit = 50
	}
	results, err := h.svc.SearchTopics(q, limit)
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	httpx.OK(c, gin.H{"query": q, "results": results})
}

func (h *Handler) listCategories(c *gin.Context) {
	items, err := h.svc.ListCategories()
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	httpx.OK(c, items)
}

func (h *Handler) categoryBySlug(c *gin.Context) {
	cat, err := h.svc.CategoryBySlug(c.Param("slug"))
	if err != nil {
		if errors.Is(err, ErrCategoryNotFound) {
			httpx.NotFound(c, "category not found")
			return
		}
		httpx.Internal(c, err.Error())
		return
	}
	httpx.OK(c, cat)
}

func (h *Handler) listTopics(c *gin.Context) {
	limit := atoiOr(c.Query("limit"), 30)
	if limit < 1 {
		limit = 30
	}
	if limit > 100 {
		limit = 100
	}
	offset := atoiOr(c.Query("offset"), 0)
	if offset < 0 {
		offset = 0
	}
	opts := TopicListOptions{
		Sort:   c.DefaultQuery("sort", "hot"),
		Limit:  limit,
		Offset: offset,
	}
	if slug := c.Query("category"); slug != "" {
		cat, err := h.svc.CategoryBySlug(slug)
		if err != nil {
			if errors.Is(err, ErrCategoryNotFound) {
				httpx.NotFound(c, "category not found")
				return
			}
			httpx.Internal(c, err.Error())
			return
		}
		opts.CategoryID = cat.ID
	} else if t := c.Query("type"); t == "anon" || t == "normal" || t == "bot" {
		// Type-scope hub pages (/anon, /bot). Whitelist to valid values so
		// an arbitrary query string can't probe for "category_type IN ?".
		opts.CategoryType = t
	}
	items, err := h.svc.ListTopics(opts)
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	uid, _ := auth.CurrentUserID(c)
	if err := h.svc.HydrateTopicsUserState(uid, items); err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	httpx.OK(c, items)
}

func (h *Handler) topicDetail(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		httpx.BadRequest(c, "invalid id")
		return
	}
	topic, posts, err := h.svc.TopicDetail(id)
	if err != nil {
		if errors.Is(err, ErrTopicNotFound) {
			httpx.NotFound(c, "topic not found")
			return
		}
		httpx.Internal(c, err.Error())
		return
	}
	uid, _ := auth.CurrentUserID(c)
	if err := h.svc.HydrateTopicUserState(uid, topic); err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	if err := h.svc.HydratePostsUserState(uid, posts); err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	httpx.OK(c, gin.H{"topic": topic, "posts": posts})
}

func (h *Handler) topicPosts(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		httpx.BadRequest(c, "invalid id")
		return
	}
	posts, err := h.svc.PostsByTopic(id)
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	httpx.OK(c, posts)
}

func (h *Handler) userTopics(c *gin.Context) {
	ref, err := h.svc.UserRefByUsername(c.Param("username"))
	if err != nil || ref == nil {
		httpx.NotFound(c, "user not found")
		return
	}
	items, err := h.svc.ListTopicsByUserID(ref.ID, atoiOr(c.Query("limit"), 30))
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	httpx.OK(c, items)
}

func (h *Handler) userPosts(c *gin.Context) {
	ref, err := h.svc.UserRefByUsername(c.Param("username"))
	if err != nil || ref == nil {
		httpx.NotFound(c, "user not found")
		return
	}
	items, err := h.svc.ListPostsByUserID(ref.ID, atoiOr(c.Query("limit"), 30))
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	httpx.OK(c, items)
}

type createTopicReq struct {
	Category     string `json:"category" binding:"required"`
	Title        string `json:"title" binding:"required"`
	Body         string `json:"body" binding:"required"`
	IsAnon       bool   `json:"is_anon"`
	MinReadLevel int16  `json:"min_read_level"`
}

func (h *Handler) createTopic(c *gin.Context) {
	var req createTopicReq
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.BadRequest(c, "invalid request")
		return
	}
	uid, _ := auth.CurrentUserID(c)
	t, err := h.svc.CreateTopic(CreateTopicInput{
		UserID:       uid,
		CategorySlug: req.Category,
		Title:        req.Title,
		Body:         req.Body,
		IsAnon:       req.IsAnon,
		MinReadLevel: req.MinReadLevel,
	})
	if err != nil {
		h.writeError(c, err)
		return
	}
	httpx.Created(c, t)
}

type createPostReq struct {
	Content      string `json:"content" binding:"required"`
	ReplyToFloor *int   `json:"reply_to_floor,omitempty"`
}

func (h *Handler) createPost(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		httpx.BadRequest(c, "invalid id")
		return
	}
	var req createPostReq
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.BadRequest(c, "invalid request")
		return
	}
	uid, _ := auth.CurrentUserID(c)
	p, err := h.svc.CreatePost(CreatePostInput{
		TopicID:      id,
		UserID:       uid,
		Content:      req.Content,
		ReplyToFloor: req.ReplyToFloor,
	})
	if err != nil {
		h.writeError(c, err)
		return
	}
	httpx.Created(c, p)
}

func (h *Handler) toggleTopicLike(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		httpx.BadRequest(c, "invalid id")
		return
	}
	uid, _ := auth.CurrentUserID(c)
	liked, count, err := h.svc.ToggleTopicLike(uid, id)
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	httpx.OK(c, gin.H{"liked": liked, "count": count})
}

func (h *Handler) togglePostLike(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		httpx.BadRequest(c, "invalid id")
		return
	}
	uid, _ := auth.CurrentUserID(c)
	liked, count, err := h.svc.TogglePostLike(uid, id)
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	httpx.OK(c, gin.H{"liked": liked, "count": count})
}

func (h *Handler) toggleBookmark(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		httpx.BadRequest(c, "invalid id")
		return
	}
	uid, _ := auth.CurrentUserID(c)
	bookmarked, err := h.svc.ToggleBookmark(uid, id)
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	httpx.OK(c, gin.H{"bookmarked": bookmarked})
}

func (h *Handler) writeError(c *gin.Context, err error) {
	// Structured moderation block with optional rewrite suggestion — handled
	// first because it needs the full error value, not a sentinel compare.
	var blocked *BlockedError
	if errors.As(err, &blocked) {
		msg := "未通过 AI 审核"
		if blocked.Reason != "" {
			msg = "未通过 AI 审核：" + blocked.Reason
		}
		if blocked.Suggestion != "" {
			httpx.FailWith(c, 422, "moderation_blocked", msg, map[string]string{
				"reason":     blocked.Reason,
				"suggestion": blocked.Suggestion,
			})
		} else {
			httpx.Fail(c, 422, "moderation_blocked", msg)
		}
		return
	}

	switch {
	case errors.Is(err, ErrCategoryNotFound):
		httpx.NotFound(c, "category not found")
	case errors.Is(err, ErrTopicNotFound):
		httpx.NotFound(c, "topic not found")
	case errors.Is(err, ErrTopicLocked):
		httpx.Fail(c, 403, "topic_locked", "topic is locked")
	case errors.Is(err, ErrInvalidTitle):
		httpx.ValidationError(c, "invalid_title", "title must be 2-200 characters")
	case errors.Is(err, ErrInvalidContent):
		httpx.ValidationError(c, "invalid_content", "content is required")
	case errors.Is(err, ErrInvalidCategory):
		httpx.ValidationError(c, "invalid_category", "category fields are invalid")
	case errors.Is(err, ErrCategorySlugTaken):
		httpx.Conflict(c, "category_slug_taken", "category slug already exists")
	case errors.Is(err, ErrCategoryInUse):
		httpx.Conflict(c, "category_in_use", "category still has topics")
	case errors.Is(err, ErrCannotMove):
		httpx.ValidationError(c, "cannot_move", "category is at the boundary")
	case errors.Is(err, ErrInvalidPinLevel):
		httpx.ValidationError(c, "invalid_pin_level", "pin level must be 0-3")
	case errors.Is(err, ErrContentBlocked):
		httpx.Fail(c, 422, "content_blocked", "包含违禁词，无法发布")
	case errors.Is(err, ErrModerationBlocked):
		httpx.Fail(c, 422, "moderation_blocked", "未通过 AI 审核，请修改后重试")
	case errors.Is(err, ErrPostNotFound):
		httpx.NotFound(c, "post not found")
	case errors.Is(err, ErrEditForbidden):
		httpx.Fail(c, 403, "edit_forbidden", "no permission to edit")
	case errors.Is(err, ErrEditWindowExpired):
		httpx.Fail(c, 403, "edit_window_expired", "edit window has expired")
	case errors.Is(err, ErrInvalidReadLevel):
		httpx.ValidationError(c, "invalid_read_level", "read level exceeds your own level")
	case errors.Is(err, ErrDuplicateSubmission):
		httpx.Fail(c, 429, "duplicate_submission", "slow down — duplicate content detected")
	case errors.Is(err, ErrBotRequired):
		httpx.Fail(c, 403, "bot_required", "posting in the bot zone requires owning at least one active bot")
	default:
		httpx.Internal(c, "internal error")
	}
}

// ---------- Admin: category CRUD ----------

// RegisterAdmin mounts the admin endpoints. The caller is expected to apply
// auth + rbac middleware before calling this.
func (h *Handler) RegisterAdmin(r *gin.RouterGroup) {
	r.POST("/categories", h.adminCreateCategory)
	r.PUT("/categories/:id", h.adminUpdateCategory)
	r.DELETE("/categories/:id", h.adminDeleteCategory)
	r.POST("/categories/:id/move", h.adminMoveCategory)

	r.POST("/topics/:id/lock", h.adminLockTopic)
	r.POST("/topics/:id/pin", h.adminPinTopic)
	r.POST("/topics/:id/feature", h.adminFeatureTopic)
	r.DELETE("/topics/:id", h.adminDeleteTopic)
	r.DELETE("/posts/:id", h.adminDeletePost)
}

type pinReq struct {
	Level  int16 `json:"level"`
	Weight int   `json:"weight"`
}

func (h *Handler) adminPinTopic(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		httpx.BadRequest(c, "invalid id")
		return
	}
	var req pinReq
	if err := c.ShouldBindJSON(&req); err != nil {
		req = pinReq{Level: 1}
	}
	t, err := h.svc.SetTopicPin(id, req.Level, req.Weight)
	if err != nil {
		h.writeError(c, err)
		return
	}
	h.record(c, audit.Input{
		Action:      "topic.pin",
		TargetType:  "topic",
		TargetID:    id,
		TargetLabel: t.Title,
		Detail:      fmt.Sprintf("level=%d weight=%d", req.Level, req.Weight),
	})
	httpx.NoContent(c)
}

type featureReq struct {
	Featured bool `json:"featured"`
}

func (h *Handler) adminFeatureTopic(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		httpx.BadRequest(c, "invalid id")
		return
	}
	var req featureReq
	if err := c.ShouldBindJSON(&req); err != nil {
		req = featureReq{Featured: true}
	}
	t, err := h.svc.SetTopicFeatured(id, req.Featured)
	if err != nil {
		h.writeError(c, err)
		return
	}
	action := "topic.feature"
	if !req.Featured {
		action = "topic.unfeature"
	}
	h.record(c, audit.Input{
		Action:      action,
		TargetType:  "topic",
		TargetID:    id,
		TargetLabel: t.Title,
	})
	httpx.NoContent(c)
}

type lockReq struct {
	Locked bool `json:"locked"`
}

func (h *Handler) adminLockTopic(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		httpx.BadRequest(c, "invalid id")
		return
	}
	var req lockReq
	if err := c.ShouldBindJSON(&req); err != nil {
		req = lockReq{Locked: true}
	}
	t, err := h.svc.SetTopicLocked(id, req.Locked)
	if err != nil {
		h.writeError(c, err)
		return
	}
	action := "topic.lock"
	if !req.Locked {
		action = "topic.unlock"
	}
	h.record(c, audit.Input{
		Action:      action,
		TargetType:  "topic",
		TargetID:    id,
		TargetLabel: t.Title,
	})
	httpx.NoContent(c)
}

func (h *Handler) adminDeleteTopic(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		httpx.BadRequest(c, "invalid id")
		return
	}
	t, err := h.svc.DeleteTopic(id)
	if err != nil {
		h.writeError(c, err)
		return
	}
	h.record(c, audit.Input{
		Action:      "topic.delete",
		TargetType:  "topic",
		TargetID:    id,
		TargetLabel: t.Title,
	})
	httpx.NoContent(c)
}

func (h *Handler) adminDeletePost(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		httpx.BadRequest(c, "invalid id")
		return
	}
	p, err := h.svc.DeletePost(id)
	if err != nil {
		h.writeError(c, err)
		return
	}
	h.record(c, audit.Input{
		Action:      "post.delete",
		TargetType:  "post",
		TargetID:    id,
		TargetLabel: fmt.Sprintf("topic #%d floor #%d", p.TopicID, p.Floor),
	})
	httpx.NoContent(c)
}

type categoryReq struct {
	Name         string `json:"name" binding:"required"`
	Slug         string `json:"slug" binding:"required"`
	Description  string `json:"description"`
	Type         string `json:"type" binding:"required"`
	PostCooldown int    `json:"post_cooldown"`
	AllowBot     bool   `json:"allow_bot"`
	Rules        string `json:"rules"`
}

func (req categoryReq) toInput() CategoryInput {
	return CategoryInput{
		Name:         req.Name,
		Slug:         req.Slug,
		Description:  req.Description,
		Type:         req.Type,
		PostCooldown: req.PostCooldown,
		AllowBot:     req.AllowBot,
		Rules:        req.Rules,
	}
}

func (h *Handler) adminCreateCategory(c *gin.Context) {
	var req categoryReq
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.BadRequest(c, "invalid request")
		return
	}
	cat, err := h.svc.CreateCategory(req.toInput())
	if err != nil {
		h.writeError(c, err)
		return
	}
	h.record(c, audit.Input{
		Action:      "category.create",
		TargetType:  "category",
		TargetID:    cat.ID,
		TargetLabel: cat.Name,
		Detail:      fmt.Sprintf("slug=%s type=%s", cat.Slug, cat.Type),
	})
	httpx.Created(c, cat)
}

func (h *Handler) adminUpdateCategory(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		httpx.BadRequest(c, "invalid id")
		return
	}
	var req categoryReq
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.BadRequest(c, "invalid request")
		return
	}
	cat, err := h.svc.UpdateCategory(id, req.toInput())
	if err != nil {
		h.writeError(c, err)
		return
	}
	h.record(c, audit.Input{
		Action:      "category.update",
		TargetType:  "category",
		TargetID:    cat.ID,
		TargetLabel: cat.Name,
		Detail:      fmt.Sprintf("slug=%s type=%s", cat.Slug, cat.Type),
	})
	httpx.OK(c, cat)
}

func (h *Handler) adminDeleteCategory(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		httpx.BadRequest(c, "invalid id")
		return
	}
	cat, _ := h.svc.repo.CategoryByID(id)
	if err := h.svc.DeleteCategory(id); err != nil {
		h.writeError(c, err)
		return
	}
	label := ""
	if cat != nil {
		label = cat.Name
	}
	h.record(c, audit.Input{
		Action:      "category.delete",
		TargetType:  "category",
		TargetID:    id,
		TargetLabel: label,
	})
	httpx.NoContent(c)
}

type moveReq struct {
	Direction string `json:"direction" binding:"required"`
}

func (h *Handler) adminMoveCategory(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		httpx.BadRequest(c, "invalid id")
		return
	}
	var req moveReq
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.BadRequest(c, "invalid request")
		return
	}
	if err := h.svc.MoveCategory(id, req.Direction); err != nil {
		h.writeError(c, err)
		return
	}
	cat, _ := h.svc.repo.CategoryByID(id)
	label := ""
	if cat != nil {
		label = cat.Name
	}
	h.record(c, audit.Input{
		Action:      "category.move",
		TargetType:  "category",
		TargetID:    id,
		TargetLabel: label,
		Detail:      "direction=" + req.Direction,
	})
	httpx.NoContent(c)
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
