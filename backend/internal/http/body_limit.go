package http

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// DefaultBodyLimit caps every non-streaming request body at 1 MiB. Forum
// posts, DMs, and profile updates all fit easily. The cap is enforced by
// wrapping the underlying request body in http.MaxBytesReader so a hostile
// client can't feed gigabytes of JSON before the handler even sees it.
//
// Streaming endpoints (SSE) don't go through a body reader so this
// middleware is safe to apply to the root router. Future file-upload
// routes should mount a larger per-route limit via MaxBodyBytes().
const DefaultBodyLimit = 1 << 20 // 1 MiB

// BodyLimit returns a middleware that caps request body size at maxBytes.
func BodyLimit(maxBytes int64) gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.Body != nil {
			c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxBytes)
		}
		c.Next()
	}
}
