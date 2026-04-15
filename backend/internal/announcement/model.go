// Package announcement exposes admin-authored system notices. Three
// placements exist intentionally:
//   - top_banner: strip across the top of every page (urgent, short)
//   - home_card:  a card on the home feed (recruitment, feature drops)
//   - inbox:      treated as a broadcast notification (delivered 1:1 later)
//
// Level controls the visual tone but has no behavioural effect.
package announcement

import "time"

type Announcement struct {
	ID          int64      `gorm:"primaryKey" json:"id"`
	Title       string     `gorm:"size:256;not null" json:"title"`
	Content     string     `gorm:"type:text;not null" json:"content"`
	Placement   string     `gorm:"size:16;not null;index" json:"placement"`
	Level       string     `gorm:"size:16;not null;default:'info'" json:"level"`
	StartAt     *time.Time `json:"start_at,omitempty"`
	EndAt       *time.Time `json:"end_at,omitempty"`
	Published   bool       `gorm:"not null;default:false;index" json:"published"`
	Dismissible bool       `gorm:"not null;default:true" json:"dismissible"`
	CreatedAt   time.Time  `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt   time.Time  `gorm:"autoUpdateTime" json:"updated_at"`
}

func (Announcement) TableName() string { return "announcements" }

const (
	PlacementTopBanner = "top_banner"
	PlacementHomeCard  = "home_card"
	PlacementInbox     = "inbox"
)

const (
	LevelInfo    = "info"
	LevelSuccess = "success"
	LevelWarning = "warning"
	LevelDanger  = "danger"
)
