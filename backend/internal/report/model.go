package report

import "time"

// Report is a moderation queue entry. target_title is snapshotted at submit
// time so the record stays meaningful even after the original topic/post/user
// is deleted.
type Report struct {
	ID               int64      `gorm:"primaryKey" json:"id"`
	ReporterUserID   int64      `gorm:"index;not null" json:"reporter_user_id"`
	ReporterUsername string     `gorm:"size:64" json:"reporter_username"`
	TargetType       string     `gorm:"size:16;not null;index:idx_report_target" json:"target_type"`
	TargetID         int64      `gorm:"not null;index:idx_report_target" json:"target_id"`
	TargetTitle      string     `gorm:"size:512" json:"target_title"`
	Reason           string     `gorm:"size:32;not null" json:"reason"`
	Description      string     `gorm:"size:1024" json:"description,omitempty"`
	Status           string     `gorm:"size:16;not null;default:'pending';index" json:"status"`
	HandlerUserID    *int64     `json:"handler_user_id,omitempty"`
	HandlerUsername  string     `gorm:"size:64" json:"handler_username,omitempty"`
	ResolutionNote   string     `gorm:"size:512" json:"resolution_note,omitempty"`
	HandledAt        *time.Time `json:"handled_at,omitempty"`
	CreatedAt        time.Time  `gorm:"autoCreateTime" json:"created_at"`
}

func (Report) TableName() string { return "reports" }

const (
	TargetTopic = "topic"
	TargetPost  = "post"
	TargetUser  = "user"
)

const (
	StatusPending   = "pending"
	StatusResolved  = "resolved"
	StatusDismissed = "dismissed"
)

const (
	ReasonSpam       = "spam"
	ReasonHarassment = "harassment"
	ReasonIllegal    = "illegal"
	ReasonPrivacy    = "privacy"
	ReasonOther      = "other"
)
