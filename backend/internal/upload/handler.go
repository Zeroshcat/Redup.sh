package upload

import (
	"errors"
	"net/http"
	"path/filepath"
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
	authed := r.Group("")
	authed.Use(auth.RequireAuth(h.jwt))
	authed.POST("/upload", h.upload)
	authed.DELETE("/attachments/:id", h.deleteAttachment)
}

// RegisterPublic mounts the static file serving route — no auth required
// so that uploaded images/videos render in topic bodies for all visitors.
func (h *Handler) RegisterPublic(r *gin.Engine) {
	r.GET("/uploads/*filepath", h.serveFile)
}

func (h *Handler) upload(c *gin.Context) {
	uid, _ := auth.CurrentUserID(c)
	if uid == 0 {
		httpx.Unauthorized(c, "auth required")
		return
	}

	// Parse multipart form — the per-route body limit is set by the caller
	// (mountRoutes) so we don't need to enforce it here.
	form, err := c.MultipartForm()
	if err != nil {
		httpx.BadRequest(c, "invalid multipart form")
		return
	}

	files := form.File["file"]
	if len(files) == 0 {
		httpx.BadRequest(c, "no file provided")
		return
	}

	// For now only handle single file upload.
	fh := files[0]
	if fh.Size > h.svc.config.MaxFileSize {
		httpx.Fail(c, http.StatusRequestEntityTooLarge, "file_too_large",
			"file exceeds maximum allowed size")
		return
	}

	mimeType := fh.Header.Get("Content-Type")
	src, err := fh.Open()
	if err != nil {
		httpx.Internal(c, "failed to read file")
		return
	}
	defer src.Close()

	a, err := h.svc.Upload(uid, filepath.Base(fh.Filename), fh.Size, mimeType, src)
	if err != nil {
		switch {
		case errors.Is(err, ErrFileTooLarge):
			httpx.Fail(c, http.StatusRequestEntityTooLarge, "file_too_large", "file exceeds maximum allowed size")
		case errors.Is(err, ErrFileTypeBlocked):
			httpx.Fail(c, http.StatusUnsupportedMediaType, "file_type_blocked", "this file type is not allowed")
		default:
			httpx.Internal(c, "upload failed")
		}
		return
	}

	httpx.Created(c, a)
}

func (h *Handler) deleteAttachment(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		httpx.BadRequest(c, "invalid id")
		return
	}
	uid, _ := auth.CurrentUserID(c)
	role, _ := c.Get("user_role")
	isAdmin := role == "admin"

	if err := h.svc.Delete(id, uid, isAdmin); err != nil {
		switch {
		case errors.Is(err, ErrAttachNotFound):
			httpx.NotFound(c, "attachment not found")
		case errors.Is(err, ErrNotOwner):
			httpx.Forbidden(c, "not the file owner")
		default:
			httpx.Internal(c, "delete failed")
		}
		return
	}
	httpx.NoContent(c)
}

func (h *Handler) serveFile(c *gin.Context) {
	urlPath := c.Request.URL.Path
	absPath := h.svc.ServeFile(urlPath)
	if absPath == "" {
		httpx.NotFound(c, "file not found")
		return
	}
	c.File(absPath)
}
