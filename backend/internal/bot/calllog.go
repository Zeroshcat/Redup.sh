package bot

import "time"

// CallLog records every bot invocation attempt for transparency and debugging.
// Snapshot fields mean a log row stays meaningful even after the source bot
// or post is deleted.
type CallLog struct {
	ID              int64     `gorm:"primaryKey" json:"id"`
	BotID           int64     `gorm:"index" json:"bot_id"`
	BotSlug         string    `gorm:"size:32" json:"bot_slug"`
	BotName         string    `gorm:"size:64" json:"bot_name"`
	TriggerUserID   int64     `gorm:"index" json:"trigger_user_id"`
	TriggerUsername string    `gorm:"size:64" json:"trigger_username,omitempty"`
	TopicID         int64     `gorm:"index" json:"topic_id"`
	TopicTitle      string    `gorm:"size:512" json:"topic_title,omitempty"`
	PostFloor       int       `gorm:"default:0" json:"post_floor"`
	Status          string    `gorm:"size:16;not null;index" json:"status"`
	LatencyMs       int       `gorm:"default:0" json:"latency_ms"`
	RequestSummary  string    `gorm:"size:1024" json:"request_summary,omitempty"`
	ResponseSummary string    `gorm:"size:1024" json:"response_summary,omitempty"`
	ErrorMessage    string    `gorm:"size:512" json:"error_message,omitempty"`
	CreatedAt       time.Time `gorm:"autoCreateTime;index" json:"created_at"`
}

func (CallLog) TableName() string { return "bot_call_logs" }

const (
	CallStatusSuccess = "success"
	CallStatusTimeout = "timeout"
	CallStatusError   = "error"
	CallStatusBlocked = "blocked"
)

type CallLogListOptions struct {
	Status  string
	BotSlug string
	Limit   int
	Offset  int
}

func (r *Repository) LogCall(c *CallLog) error {
	return r.db.Create(c).Error
}

func (r *Repository) ListCalls(opts CallLogListOptions) ([]CallLog, int64, error) {
	q := r.db.Model(&CallLog{})
	if opts.Status != "" {
		q = q.Where("status = ?", opts.Status)
	}
	if opts.BotSlug != "" {
		q = q.Where("bot_slug = ?", opts.BotSlug)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	if opts.Limit == 0 {
		opts.Limit = 100
	}
	q = q.Order("created_at DESC").Limit(opts.Limit).Offset(opts.Offset)
	var items []CallLog
	if err := q.Find(&items).Error; err != nil {
		return nil, 0, err
	}
	return items, total, nil
}

// CallStats returns aggregated counts by status — used by the admin page header.
func (r *Repository) CallStats() (map[string]int64, error) {
	out := map[string]int64{
		CallStatusSuccess: 0,
		CallStatusTimeout: 0,
		CallStatusError:   0,
		CallStatusBlocked: 0,
	}
	rows := []struct {
		Status string
		N      int64
	}{}
	if err := r.db.Model(&CallLog{}).
		Select("status, COUNT(*) AS n").
		Group("status").
		Scan(&rows).Error; err != nil {
		return nil, err
	}
	for _, row := range rows {
		out[row.Status] = row.N
	}
	return out, nil
}

