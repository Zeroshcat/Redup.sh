package rbac

// Builtin role keys. User.Role column holds one of these strings.
const (
	RoleGuest     = "guest"
	RoleUser      = "user"
	RoleTrusted   = "trusted"
	RoleDeveloper = "developer"
	RoleModerator = "moderator"
	RoleAdmin     = "admin"
	RoleBot       = "bot"
)

// defaultRolePermissions is the builtin permission map keyed by role.
// Missing role → empty set → no permissions.
//
// For MVP this lives in code. Phase 2 will move it to a roles table so the
// admin panel can customize per-deployment.
var defaultRolePermissions = map[string]map[string]bool{
	RoleGuest: setOf(),

	RoleUser: setOf(
		PermTopicCreate,
		PermTopicEditOwn,
		PermTopicDeleteOwn,
		PermReplyCreate,
		PermReplyEditOwn,
		PermReplyDeleteOwn,
		PermReplyVote,
	),

	RoleTrusted: setOf(
		PermTopicCreate,
		PermTopicEditOwn,
		PermTopicDeleteOwn,
		PermReplyCreate,
		PermReplyEditOwn,
		PermReplyDeleteOwn,
		PermReplyVote,
		PermAnonView,
		PermAnonPost,
		PermBotCreatePrivate,
	),

	RoleDeveloper: setOf(
		PermTopicCreate,
		PermTopicEditOwn,
		PermTopicDeleteOwn,
		PermReplyCreate,
		PermReplyEditOwn,
		PermReplyDeleteOwn,
		PermReplyVote,
		PermAnonView,
		PermAnonPost,
		PermBotCreatePrivate,
		PermBotPublishPublic,
	),

	RoleModerator: setOf(
		PermTopicCreate,
		PermTopicEditOwn,
		PermTopicEditAny,
		PermTopicDeleteOwn,
		PermTopicDeleteAny,
		PermTopicLock,
		PermTopicPin,
		PermTopicFeature,
		PermReplyCreate,
		PermReplyEditOwn,
		PermReplyEditAny,
		PermReplyDeleteOwn,
		PermReplyDeleteAny,
		PermReplyVote,
		PermAnonView,
		PermAnonPost,
		PermUserWarn,
		PermUserMute,
		PermModReportHandle,
		PermModContentReview,
	),

	RoleAdmin: allPerms(),

	RoleBot: setOf(
		PermReplyCreate,
		PermTopicEditOwn,
	),
}

func setOf(perms ...string) map[string]bool {
	s := make(map[string]bool, len(perms))
	for _, p := range perms {
		s[p] = true
	}
	return s
}

func allPerms() map[string]bool {
	all := AllPermissions()
	return setOf(all...)
}

// HasPermission returns true if the given role is allowed the given
// permission. Unknown roles or permissions default to false.
func HasPermission(role, perm string) bool {
	perms, ok := defaultRolePermissions[role]
	if !ok {
		return false
	}
	return perms[perm]
}

// PermissionsForRole returns a copy of the permission set for a role.
// Used by the admin UI to show the matrix.
func PermissionsForRole(role string) map[string]bool {
	src := defaultRolePermissions[role]
	out := make(map[string]bool, len(src))
	for k, v := range src {
		out[k] = v
	}
	return out
}
