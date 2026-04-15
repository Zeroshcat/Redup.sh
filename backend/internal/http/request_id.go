package http

import (
	"crypto/rand"
	"encoding/hex"

	"github.com/gin-gonic/gin"
)

const (
	HeaderRequestID    = "X-Request-ID"
	ContextKeyRequestID = "request_id"
)

// RequestID middleware: uses the client-provided X-Request-ID if present
// (enables cross-service trace propagation), otherwise generates a short
// 12-hex-char id. Always sets the value on the gin context and the response
// header.
func RequestID() gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.GetHeader(HeaderRequestID)
		if id == "" || !isSafe(id) {
			id = generate()
		}
		c.Set(ContextKeyRequestID, id)
		c.Writer.Header().Set(HeaderRequestID, id)
		c.Next()
	}
}

func GetRequestID(c *gin.Context) string {
	if v, ok := c.Get(ContextKeyRequestID); ok {
		if id, ok := v.(string); ok {
			return id
		}
	}
	return ""
}

func generate() string {
	b := make([]byte, 6)
	if _, err := rand.Read(b); err != nil {
		return "xxxxxxxxxxxx"
	}
	return hex.EncodeToString(b)
}

// isSafe guards against header injection: only accept reasonable lengths and
// printable ASCII. Falls back to generated id otherwise.
func isSafe(s string) bool {
	if len(s) == 0 || len(s) > 64 {
		return false
	}
	for _, r := range s {
		if r < 0x20 || r > 0x7e {
			return false
		}
	}
	return true
}
