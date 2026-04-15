package follow

import (
	"errors"
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/redup/backend/internal/auth"
	httpx "github.com/redup/backend/internal/http"
)

type Handler struct {
	svc *Service
	jwt *auth.JWTManager
}

func NewHandler(svc *Service, jwt *auth.JWTManager) *Handler {
	return &Handler{svc: svc, jwt: jwt}
}

func (h *Handler) Register(r *gin.RouterGroup) {
	// Use a /follow prefix to avoid colliding with existing /api/users/:username
	// routes — gin requires consistent wildcard names within a prefix.
	stats := r.Group("/follow")
	stats.Use(auth.OptionalAuth(h.jwt))
	stats.GET("/users/:id/stats", h.stats)

	authed := r.Group("/follow")
	authed.Use(auth.RequireAuth(h.jwt))
	authed.POST("/users/:id", h.follow)
	authed.DELETE("/users/:id", h.unfollow)
}

func (h *Handler) stats(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		httpx.BadRequest(c, "invalid id")
		return
	}
	viewerID, _ := auth.CurrentUserID(c)
	stats, err := h.svc.Stats(viewerID, id)
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	httpx.OK(c, stats)
}

func (h *Handler) follow(c *gin.Context) {
	uid, _ := auth.CurrentUserID(c)
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		httpx.BadRequest(c, "invalid id")
		return
	}
	if err := h.svc.Follow(uid, id); err != nil {
		h.writeError(c, err)
		return
	}
	stats, _ := h.svc.Stats(uid, id)
	httpx.OK(c, stats)
}

func (h *Handler) unfollow(c *gin.Context) {
	uid, _ := auth.CurrentUserID(c)
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		httpx.BadRequest(c, "invalid id")
		return
	}
	if err := h.svc.Unfollow(uid, id); err != nil {
		h.writeError(c, err)
		return
	}
	stats, _ := h.svc.Stats(uid, id)
	httpx.OK(c, stats)
}

func (h *Handler) writeError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, ErrSelfFollow):
		httpx.ValidationError(c, "self_follow", "cannot follow yourself")
	case errors.Is(err, ErrNotFound):
		httpx.NotFound(c, "user not found")
	default:
		httpx.Internal(c, err.Error())
	}
}
