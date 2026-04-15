package auth

import (
	"strings"

	"github.com/gin-gonic/gin"

	httpx "github.com/redup/backend/internal/http"
)

const ContextKeyUserID = "user_id"

func RequireAuth(jwtManager *JWTManager) gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		if header == "" {
			httpx.Unauthorized(c, "missing Authorization header")
			return
		}
		parts := strings.SplitN(header, " ", 2)
		if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
			httpx.Unauthorized(c, "invalid Authorization header")
			return
		}
		claims, err := jwtManager.ParseAccess(parts[1])
		if err != nil {
			httpx.Fail(c, 401, httpx.CodeTokenInvalid, "invalid or expired token")
			return
		}
		c.Set(ContextKeyUserID, claims.UserID)
		c.Set("user_role", claims.Role)
		c.Next()
	}
}

func CurrentUserID(c *gin.Context) (int64, bool) {
	v, exists := c.Get(ContextKeyUserID)
	if !exists {
		return 0, false
	}
	id, ok := v.(int64)
	return id, ok
}

// OptionalAuth parses Authorization if present and populates user_id/role on
// the context when the token is valid. Missing/invalid tokens do NOT block
// the request — the handler serves anonymous content and can check
// CurrentUserID to decide whether to attach user-specific state.
func OptionalAuth(jwtManager *JWTManager) gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		if header == "" {
			c.Next()
			return
		}
		parts := strings.SplitN(header, " ", 2)
		if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
			c.Next()
			return
		}
		claims, err := jwtManager.ParseAccess(parts[1])
		if err != nil {
			c.Next()
			return
		}
		c.Set(ContextKeyUserID, claims.UserID)
		c.Set("user_role", claims.Role)
		c.Next()
	}
}
