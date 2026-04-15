package rbac

import (
	"github.com/gin-gonic/gin"

	httpx "github.com/redup/backend/internal/http"
)

const ContextKeyRole = "user_role"

// RoleFromContext reads the role set by the auth middleware. Returns empty
// string if not set (which represents "unauthenticated" for permission
// checks — guest role semantics).
func RoleFromContext(c *gin.Context) string {
	if v, ok := c.Get(ContextKeyRole); ok {
		if r, ok := v.(string); ok {
			return r
		}
	}
	return ""
}

// RequirePermission denies the request unless the current user's role has
// the given permission. Must run AFTER auth.RequireAuth so the role is
// populated on the context.
func RequirePermission(perm string) gin.HandlerFunc {
	return func(c *gin.Context) {
		role := RoleFromContext(c)
		if !HasPermission(role, perm) {
			httpx.Forbidden(c, "permission denied: "+perm)
			return
		}
		c.Next()
	}
}

// RequireRole is a coarser-grained guard: the user must be in one of the
// listed roles. Convenience for endpoints that don't map cleanly to a single
// permission (e.g. "all admin ops").
func RequireRole(roles ...string) gin.HandlerFunc {
	set := make(map[string]bool, len(roles))
	for _, r := range roles {
		set[r] = true
	}
	return func(c *gin.Context) {
		role := RoleFromContext(c)
		if !set[role] {
			httpx.Forbidden(c, "role required: "+roleList(roles))
			return
		}
		c.Next()
	}
}

func roleList(roles []string) string {
	s := ""
	for i, r := range roles {
		if i > 0 {
			s += ","
		}
		s += r
	}
	return s
}
