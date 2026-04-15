package follow

import "time"

// Follow is a directional relationship: follower_id follows target_id.
// The composite unique index prevents duplicate rows for the same pair.
type Follow struct {
	ID         int64     `gorm:"primaryKey" json:"id"`
	FollowerID int64     `gorm:"not null;index:idx_follow_pair,unique,priority:1" json:"follower_id"`
	TargetID   int64     `gorm:"not null;index:idx_follow_pair,unique,priority:2;index" json:"target_id"`
	CreatedAt  time.Time `gorm:"autoCreateTime" json:"created_at"`
}

func (Follow) TableName() string { return "follows" }
