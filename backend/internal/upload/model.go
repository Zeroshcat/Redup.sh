package upload

import "time"

// Attachment represents a file uploaded by a user. Files are stored on the
// local filesystem under the configured upload directory; the DB row tracks
// the metadata and serves as the source of truth for access control.
type Attachment struct {
	ID          int64      `gorm:"primaryKey" json:"id"`
	UserID      int64      `gorm:"index;not null" json:"user_id"`
	FileName    string     `gorm:"size:256;not null" json:"file_name"`
	FileSize    int64      `gorm:"not null" json:"file_size"`
	MIMEType    string     `gorm:"size:128;not null" json:"mime_type"`
	StoragePath string     `gorm:"size:512;not null" json:"-"`
	URL         string     `gorm:"size:512;not null" json:"url"`
	Width       int        `gorm:"default:0" json:"width,omitempty"`
	Height      int        `gorm:"default:0" json:"height,omitempty"`
	TargetType  string     `gorm:"size:32;index:idx_attach_target" json:"target_type,omitempty"` // topic / post
	TargetID    int64      `gorm:"index:idx_attach_target" json:"target_id,omitempty"`
	CreatedAt   time.Time  `gorm:"autoCreateTime" json:"created_at"`
	DeletedAt   *time.Time `json:"-"`
}

func (Attachment) TableName() string { return "attachments" }
