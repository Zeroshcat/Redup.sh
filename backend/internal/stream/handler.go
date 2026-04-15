package stream

import (
	"fmt"
	"io"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/redup/backend/internal/auth"
	httpx "github.com/redup/backend/internal/http"
)

type Handler struct {
	hub *Hub
	jwt *auth.JWTManager
}

func NewHandler(hub *Hub, jwt *auth.JWTManager) *Handler {
	return &Handler{hub: hub, jwt: jwt}
}

// Register mounts the single SSE endpoint. Auth is via a `token` query
// parameter because EventSource can't set Authorization headers.
func (h *Handler) Register(r *gin.RouterGroup) {
	r.GET("/stream", h.stream)
}

func (h *Handler) stream(c *gin.Context) {
	token := c.Query("token")
	if token == "" {
		httpx.Unauthorized(c, "missing token")
		return
	}
	claims, err := h.jwt.ParseAccess(token)
	if err != nil {
		httpx.Fail(c, 401, httpx.CodeTokenInvalid, "invalid or expired token")
		return
	}
	userID := claims.UserID

	// SSE headers.
	c.Writer.Header().Set("Content-Type", "text/event-stream")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("Connection", "keep-alive")
	c.Writer.Header().Set("X-Accel-Buffering", "no") // disable nginx buffering
	c.Writer.WriteHeader(200)

	flusher, ok := c.Writer.(interface{ Flush() })
	if !ok {
		httpx.Internal(c, "streaming unsupported")
		return
	}

	// Initial hello event so the client knows the connection is live and can
	// kick off any first-load refresh it wants.
	_, _ = fmt.Fprintf(c.Writer, "event: hello\ndata: {\"user_id\":%d}\n\n", userID)
	flusher.Flush()

	events, unsubscribe := h.hub.Subscribe(userID, claims.Role == "admin")
	defer unsubscribe()

	// Ping every 25s to keep proxies from closing idle connections and to
	// notice dead client sockets early.
	ticker := time.NewTicker(25 * time.Second)
	defer ticker.Stop()

	ctx := c.Request.Context()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if _, err := io.WriteString(c.Writer, ": keepalive\n\n"); err != nil {
				return
			}
			flusher.Flush()
		case e, ok := <-events:
			if !ok {
				return
			}
			if _, err := fmt.Fprintf(c.Writer, "event: %s\ndata: %s\n\n", e.Type, e.Data); err != nil {
				return
			}
			flusher.Flush()
		}
	}
}
