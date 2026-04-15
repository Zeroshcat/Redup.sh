package audit

import "time"

// Log is an immutable record of an admin action. Snapshot fields (actor
// username, target label) survive deletion of the referenced rows.
type Log struct {
	ID            int64     `gorm:"primaryKey" json:"id"`
	ActorUserID   int64     `gorm:"index" json:"actor_user_id"`
	ActorUsername string    `gorm:"size:64" json:"actor_username"`
	Action        string    `gorm:"size:64;not null;index" json:"action"`
	TargetType    string    `gorm:"size:32;index" json:"target_type"`
	TargetID      int64     `gorm:"index" json:"target_id"`
	TargetLabel   string    `gorm:"size:512" json:"target_label"`
	Detail        string    `gorm:"size:1024" json:"detail,omitempty"`
	IP            string    `gorm:"size:64" json:"ip,omitempty"`
	CreatedAt     time.Time `gorm:"autoCreateTime;index" json:"created_at"`
}

func (Log) TableName() string { return "audit_logs" }
