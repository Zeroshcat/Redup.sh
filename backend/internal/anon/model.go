package anon

import "time"

// IDMapping gives a (topic, user) pair a stable Anon identifier. The first
// anon post in a topic creates the mapping, subsequent posts reuse it so the
// same user keeps the same display id inside one thread.
type IDMapping struct {
	TopicID   int64     `gorm:"primaryKey;autoIncrement:false" json:"topic_id"`
	UserID    int64     `gorm:"primaryKey;autoIncrement:false" json:"user_id"`
	AnonID    string    `gorm:"size:64;not null" json:"anon_id"`
	CreatedAt time.Time `gorm:"autoCreateTime" json:"created_at"`
}

func (IDMapping) TableName() string { return "anonymous_id_mappings" }

// AuditLog records every anonymous post for moderation trail. Independent of
// the mapping table — even if a post is deleted or a mapping regenerated, the
// audit log remains as an immutable record.
type AuditLog struct {
	ID        int64     `gorm:"primaryKey" json:"id"`
	PostID    int64     `gorm:"index" json:"post_id"`
	TopicID   int64     `gorm:"index;not null" json:"topic_id"`
	UserID    int64     `gorm:"index;not null" json:"user_id"`
	AnonID    string    `gorm:"size:64;not null" json:"anon_id"`
	CreatedAt time.Time `gorm:"autoCreateTime" json:"created_at"`
}

func (AuditLog) TableName() string { return "anonymous_audit_logs" }
