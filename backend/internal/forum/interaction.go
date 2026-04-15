package forum

import "time"

// Like records a user's upvote on a topic or post. The composite unique
// index (user_id, target_type, target_id) enforces "one vote per user per
// target" at the DB level.
type Like struct {
	ID         int64     `gorm:"primaryKey" json:"id"`
	UserID     int64     `gorm:"uniqueIndex:idx_like_user_target;not null" json:"user_id"`
	TargetType string    `gorm:"uniqueIndex:idx_like_user_target;size:16;not null" json:"target_type"` // topic / post
	TargetID   int64     `gorm:"uniqueIndex:idx_like_user_target;not null" json:"target_id"`
	CreatedAt  time.Time `gorm:"autoCreateTime" json:"created_at"`
}

func (Like) TableName() string { return "likes" }

// Bookmark records a user saving a topic for later. Only topics are
// bookmarkable — posts are too granular to be worth saving.
type Bookmark struct {
	ID        int64     `gorm:"primaryKey" json:"id"`
	UserID    int64     `gorm:"uniqueIndex:idx_bookmark_user_topic;not null" json:"user_id"`
	TopicID   int64     `gorm:"uniqueIndex:idx_bookmark_user_topic;not null" json:"topic_id"`
	CreatedAt time.Time `gorm:"autoCreateTime" json:"created_at"`
}

func (Bookmark) TableName() string { return "bookmarks" }

const (
	TargetTopic = "topic"
	TargetPost  = "post"
)
