// Package dashboard exposes a single aggregate endpoint that powers the
// admin home page. It deliberately has no repository of its own — it's pure
// composition over the existing domain services, wired by main.go via the
// narrow interfaces below. Keeping it in platform/ (rather than inside a
// specific domain module) makes clear that this is a read-only projection,
// not a source of truth.
package dashboard

import (
	"github.com/gin-gonic/gin"

	"github.com/redup/backend/internal/audit"
	"github.com/redup/backend/internal/bot"
	httpx "github.com/redup/backend/internal/http"
	"github.com/redup/backend/internal/report"
	"github.com/redup/backend/internal/user"
)

// UserSource gives us the total user count. Implemented by user.Service.List
// with a limit of 1 — we only need the `total` return value.
type UserSource interface {
	List(opts user.ListOptions) ([]user.User, int64, error)
}

// TopicSource returns the non-deleted topic total.
type TopicSource interface {
	CountTopics() (int64, error)
}

// BotSource gives us the counts and short previews for the bot column:
// active total, pending applications, and recent failed webhook deliveries.
type BotSource interface {
	ListAdmin(opts bot.ListOptions) ([]bot.Bot, int64, error)
	ListCalls(opts bot.CallLogListOptions) ([]bot.CallLog, int64, error)
	CallStats() (map[string]int64, error)
}

// ReportSource gives us pending-report count and preview list.
type ReportSource interface {
	Counts() (report.StatusCounts, error)
	List(opts report.ListOptions) ([]report.Report, error)
}

// AuditSource gives us the most recent admin action feed.
type AuditSource interface {
	List(opts audit.ListOptions) ([]audit.Log, int64, error)
}

type Handler struct {
	users   UserSource
	topics  TopicSource
	bots    BotSource
	reports ReportSource
	audit   AuditSource
}

func NewHandler(u UserSource, t TopicSource, b BotSource, r ReportSource, a AuditSource) *Handler {
	return &Handler{users: u, topics: t, bots: b, reports: r, audit: a}
}

func (h *Handler) RegisterAdmin(r *gin.RouterGroup) {
	r.GET("/dashboard", h.get)
}

// Response is the single aggregate shape the frontend consumes. All counts
// live under `counts`; preview lists are returned separately and capped to 5
// entries each so this endpoint stays cheap to call on every dashboard load.
type Response struct {
	Counts         Counts           `json:"counts"`
	PendingReports []report.Report  `json:"pending_reports"`
	PendingBots    []bot.Bot        `json:"pending_bots"`
	FailedBotCalls []bot.CallLog    `json:"failed_bot_calls"`
	RecentAudit    []audit.Log      `json:"recent_audit"`
}

type Counts struct {
	Users           int64 `json:"users"`
	Topics          int64 `json:"topics"`
	Bots            int64 `json:"bots"`
	PendingReports  int64 `json:"pending_reports"`
	PendingBots     int64 `json:"pending_bots"`
	FailedBotCalls  int64 `json:"failed_bot_calls"`
}

const previewLimit = 5

func (h *Handler) get(c *gin.Context) {
	var resp Response

	if _, total, err := h.users.List(user.ListOptions{Limit: 1}); err == nil {
		resp.Counts.Users = total
	}
	if n, err := h.topics.CountTopics(); err == nil {
		resp.Counts.Topics = n
	}

	// Bots: total active population, plus a pending-applications count and
	// preview. We run two queries — one without a status filter for the
	// overall bot total, and one filtered to "pending" for the review queue.
	if _, total, err := h.bots.ListAdmin(bot.ListOptions{Limit: 1}); err == nil {
		resp.Counts.Bots = total
	}
	if items, total, err := h.bots.ListAdmin(bot.ListOptions{Status: bot.StatusPending, Limit: previewLimit}); err == nil {
		resp.Counts.PendingBots = total
		resp.PendingBots = items
	}

	// Bot call failures: CallStats gives us all buckets in one query; we
	// sum the three failure buckets for the headline count. The preview
	// list needs separate queries per failure status so we merge them.
	if stats, err := h.bots.CallStats(); err == nil {
		resp.Counts.FailedBotCalls = stats[bot.CallStatusError] + stats[bot.CallStatusTimeout] + stats[bot.CallStatusBlocked]
	}
	// Preview: grab the most recent N error rows. Timeout/blocked logs are
	// usually rarer — keeping the preview narrow to "error" is fine because
	// the target page (/admin/bot-logs) can filter for the rest.
	if items, _, err := h.bots.ListCalls(bot.CallLogListOptions{Status: bot.CallStatusError, Limit: previewLimit}); err == nil {
		resp.FailedBotCalls = items
	}

	// Reports: pending count comes from the dedicated counts endpoint; the
	// preview list uses the same service path the /admin/reports page hits.
	if counts, err := h.reports.Counts(); err == nil {
		resp.Counts.PendingReports = counts.Pending
	}
	if items, err := h.reports.List(report.ListOptions{Status: report.StatusPending, Limit: previewLimit}); err == nil {
		resp.PendingReports = items
	}

	// Audit feed: most recent operator actions across all modules.
	if items, _, err := h.audit.List(audit.ListOptions{Limit: previewLimit + 1}); err == nil {
		resp.RecentAudit = items
	}

	httpx.OK(c, resp)
}
