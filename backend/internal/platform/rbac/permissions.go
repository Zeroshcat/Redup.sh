package rbac

// Permission keys — stable strings stored on roles and checked by middleware.
// These mirror the set displayed in the admin frontend so both sides stay in
// lockstep. Adding a new permission here requires updating the role
// definitions below AND the frontend role editor.
const (
	// Topics
	PermTopicCreate    = "topic.create"
	PermTopicEditOwn   = "topic.edit_own"
	PermTopicEditAny   = "topic.edit_any"
	PermTopicDeleteOwn = "topic.delete_own"
	PermTopicDeleteAny = "topic.delete_any"
	PermTopicLock      = "topic.lock"
	PermTopicPin       = "topic.pin"
	PermTopicFeature   = "topic.feature"

	// Replies
	PermReplyCreate    = "reply.create"
	PermReplyEditOwn   = "reply.edit_own"
	PermReplyEditAny   = "reply.edit_any"
	PermReplyDeleteOwn = "reply.delete_own"
	PermReplyDeleteAny = "reply.delete_any"
	PermReplyVote      = "reply.vote"

	// Anonymous
	PermAnonView  = "anon.view"
	PermAnonPost  = "anon.post"
	PermAnonAudit = "anon.audit" // trace back real users — admin only

	// Users
	PermUserWarn         = "user.warn"
	PermUserMute         = "user.mute"
	PermUserBan          = "user.ban"
	PermUserCreditAdjust = "user.credit_adjust"
	PermUserRoleAssign   = "user.role_assign"

	// Bot
	PermBotCreatePrivate = "bot.create_private"
	PermBotPublishPublic = "bot.publish_public"
	PermBotReview        = "bot.review"
	PermBotSuspend       = "bot.suspend"
	PermBotViewLogs      = "bot.view_logs"

	// Moderation
	PermModReportHandle   = "moderation.report_handle"
	PermModContentReview  = "moderation.content_review"
	PermModFilterManage   = "moderation.filter_manage"

	// Site
	PermSiteSettings      = "site.settings"
	PermSiteCategories    = "site.categories"
	PermSiteAnnouncements = "site.announcements"
	PermSiteLLM           = "site.llm"
	PermSiteAuditView     = "site.audit_view"
)

// AllPermissions lists every permission, used by the admin/roles endpoint
// to populate the permission matrix in the UI.
func AllPermissions() []string {
	return []string{
		PermTopicCreate, PermTopicEditOwn, PermTopicEditAny,
		PermTopicDeleteOwn, PermTopicDeleteAny,
		PermTopicLock, PermTopicPin, PermTopicFeature,

		PermReplyCreate, PermReplyEditOwn, PermReplyEditAny,
		PermReplyDeleteOwn, PermReplyDeleteAny, PermReplyVote,

		PermAnonView, PermAnonPost, PermAnonAudit,

		PermUserWarn, PermUserMute, PermUserBan,
		PermUserCreditAdjust, PermUserRoleAssign,

		PermBotCreatePrivate, PermBotPublishPublic,
		PermBotReview, PermBotSuspend, PermBotViewLogs,

		PermModReportHandle, PermModContentReview, PermModFilterManage,

		PermSiteSettings, PermSiteCategories, PermSiteAnnouncements,
		PermSiteLLM, PermSiteAuditView,
	}
}
