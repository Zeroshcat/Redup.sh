package anon

import (
	"errors"
	"strconv"
	"strings"

	"gorm.io/gorm"
)

type Repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

// GetMapping returns the existing anon id for (topic, user), or nil if none yet.
func (r *Repository) GetMapping(topicID, userID int64) (*IDMapping, error) {
	var m IDMapping
	if err := r.db.Where("topic_id = ? AND user_id = ?", topicID, userID).First(&m).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &m, nil
}

// CreateMappingIfAbsent inserts a new mapping. If another request raced and
// already inserted one, the second insert fails with a unique-constraint
// violation and the caller should re-read the existing row.
func (r *Repository) CreateMappingIfAbsent(m *IDMapping) error {
	return r.db.Create(m).Error
}

func (r *Repository) CreateAuditLog(log *AuditLog) error {
	return r.db.Create(log).Error
}

// AuditSearchRow is the aggregate shape returned by SearchAudit: one row per
// (anon_id, topic_id, user_id) tuple, with activity counts and denormalized
// labels pulled from the users and topics tables. Admins use this to trace a
// single anon display id back to its real account, or to inventory all anon
// activity by a given user.
type AuditSearchRow struct {
	AnonID       string `json:"anon_id"`
	UserID       int64  `json:"user_id"`
	RealUsername string `json:"real_username"`
	TopicID      int64  `json:"topic_id"`
	TopicTitle   string `json:"topic_title"`
	PostCount    int64  `json:"post_count"`
	FirstSeen    string `json:"first_seen"`
	LastSeen     string `json:"last_seen"`
}

// SearchAudit scans anonymous_audit_logs, optionally filtered by a free-text
// query that matches any of: anon id, real username, topic id, or topic
// title. Joins `users` and `topics` directly — those tables are stable
// cross-module shared state (forum.UserRef already aliases users the same
// way), so we don't need a Go import to read them.
//
// Results are grouped so an admin sees one row per (anon_id, topic) pair
// with aggregate post_count / first_seen / last_seen, matching the UI.
func (r *Repository) SearchAudit(query string, limit int) ([]AuditSearchRow, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}

	q := r.db.Table("anonymous_audit_logs AS a").
		Select(`a.anon_id AS anon_id,
		        a.user_id AS user_id,
		        COALESCE(u.username, '') AS real_username,
		        a.topic_id AS topic_id,
		        COALESCE(t.title, '') AS topic_title,
		        COUNT(*) AS post_count,
		        MIN(a.created_at) AS first_seen,
		        MAX(a.created_at) AS last_seen`).
		Joins("LEFT JOIN users u ON u.id = a.user_id").
		Joins("LEFT JOIN topics t ON t.id = a.topic_id").
		Group("a.anon_id, a.user_id, u.username, a.topic_id, t.title").
		Order("MAX(a.created_at) DESC").
		Limit(limit)

	if query = strings.TrimSpace(query); query != "" {
		like := "%" + query + "%"
		// Try to parse as an integer so "1234" can also match an exact topic id.
		var topicIDMatch int64
		if n, err := strconv.ParseInt(query, 10, 64); err == nil {
			topicIDMatch = n
		}
		q = q.Where(
			"a.anon_id ILIKE ? OR u.username ILIKE ? OR t.title ILIKE ? OR a.topic_id = ?",
			like, like, like, topicIDMatch,
		)
	}

	var rows []AuditSearchRow
	if err := q.Scan(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}
