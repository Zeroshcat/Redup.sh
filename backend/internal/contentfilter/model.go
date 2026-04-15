package contentfilter

import "time"

// Word is a single entry in the moderation blacklist. Matching is
// case-insensitive substring on the normalized form. Disabled rows are
// retained so admins can re-enable without retyping.
type Word struct {
	ID        int64     `gorm:"primaryKey" json:"id"`
	Word      string    `gorm:"size:128;not null;uniqueIndex:idx_word_lower" json:"word"`
	Severity  string    `gorm:"size:16;not null;default:'block'" json:"severity"`
	Note      string    `gorm:"size:256" json:"note,omitempty"`
	Enabled   bool      `gorm:"default:true" json:"enabled"`
	CreatedAt time.Time `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt time.Time `gorm:"autoUpdateTime" json:"updated_at"`
}

func (Word) TableName() string { return "content_filter_words" }

const (
	SeverityWarn  = "warn"  // logged but not blocked (for future review queue)
	SeverityBlock = "block" // create call returns an error
)
