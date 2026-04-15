package bot

import "time"

// Bot is a first-class identity registered by a user. Status drives whether
// the bot is visible to readers and (in phase 2) eligible to be triggered.
type Bot struct {
	ID            int64      `gorm:"primaryKey" json:"id"`
	Slug          string     `gorm:"size:32;uniqueIndex;not null" json:"slug"`
	Name          string     `gorm:"size:64;not null" json:"name"`
	Description   string     `gorm:"type:text;not null" json:"description"`
	AvatarURL     string     `gorm:"size:512" json:"avatar_url,omitempty"`
	OwnerUserID   int64      `gorm:"index;not null" json:"owner_user_id"`
	OwnerUsername string     `gorm:"size:64" json:"owner_username,omitempty"`
	ModelProvider string     `gorm:"size:32;not null" json:"model_provider"`
	ModelName     string     `gorm:"size:64;not null" json:"model_name"`
	WebhookURL    string     `gorm:"size:512" json:"webhook_url,omitempty"`
	APIKey        string     `gorm:"size:256" json:"-"`
	SystemPrompt  string     `gorm:"type:text" json:"system_prompt,omitempty"`
	Tags          string     `gorm:"size:256" json:"tags,omitempty"`
	Status        string     `gorm:"size:16;not null;default:'pending';index" json:"status"`
	IsOfficial    bool       `gorm:"default:false" json:"is_official"`
	IsFeatured    bool       `gorm:"default:false" json:"is_featured"`
	IsModerator   bool       `gorm:"default:false;index" json:"is_moderator"`
	CallCount     int64      `gorm:"default:0" json:"call_count"`
	LikeCount     int64      `gorm:"default:0" json:"like_count"`
	RejectionNote string     `gorm:"size:512" json:"rejection_note,omitempty"`
	ApprovedBy    int64      `json:"approved_by,omitempty"`
	ApprovedAt    *time.Time `json:"approved_at,omitempty"`
	CreatedAt     time.Time  `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt     time.Time  `gorm:"autoUpdateTime" json:"updated_at"`
}

func (Bot) TableName() string { return "bots" }

const (
	StatusPending   = "pending"
	StatusActive    = "active"
	StatusRejected  = "rejected"
	StatusSuspended = "suspended"
)

// model_provider and model_name are now purely informational display labels.
// User bots are driven by webhooks — the bot owner picks whatever model they
// run behind their backend; the platform just shows the label they entered.
