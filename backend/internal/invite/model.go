package invite

import "time"

// Code is a single-use or limited-use invitation code that allows a new
// user to register when the site's registration mode requires one.
type Code struct {
	ID          int64      `gorm:"primaryKey" json:"id"`
	Code        string     `gorm:"size:32;uniqueIndex;not null" json:"code"`
	CreatorID   int64      `gorm:"index;not null" json:"creator_id"`
	CreatorName string     `gorm:"size:64" json:"creator_name,omitempty"`
	MaxUses     int        `gorm:"default:1" json:"max_uses"`
	UsedCount   int        `gorm:"default:0" json:"used_count"`
	Note        string     `gorm:"size:256" json:"note,omitempty"`
	ExpiresAt   *time.Time `json:"expires_at,omitempty"`
	CreatedAt   time.Time  `gorm:"autoCreateTime" json:"created_at"`
}

func (Code) TableName() string { return "invite_codes" }

// Usage records who redeemed which code and when.
type Usage struct {
	ID         int64     `gorm:"primaryKey" json:"id"`
	CodeID     int64     `gorm:"index;not null" json:"code_id"`
	UserID     int64     `gorm:"index;not null" json:"user_id"`
	Username   string    `gorm:"size:64" json:"username"`
	RedeemedAt time.Time `gorm:"autoCreateTime" json:"redeemed_at"`
}

func (Usage) TableName() string { return "invite_code_usages" }
