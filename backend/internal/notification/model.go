package notification

import "time"

// Notification is a fan-out record per recipient. Actor + target fields are
// snapshotted at write time so the entry stays meaningful after the source
// rows are deleted or the actor renamed.
type Notification struct {
	ID            int64     `gorm:"primaryKey" json:"id"`
	RecipientID   int64     `gorm:"index;not null" json:"recipient_id"`
	Type          string    `gorm:"size:16;not null;index" json:"type"`
	ActorUserID   int64     `gorm:"index" json:"actor_user_id"`
	ActorUsername string    `gorm:"size:64" json:"actor_username"`
	ActorIsAnon   bool      `gorm:"default:false" json:"actor_is_anon"`
	TargetType    string    `gorm:"size:16" json:"target_type,omitempty"`
	TargetID      int64     `json:"target_id,omitempty"`
	TargetTitle   string    `gorm:"size:512" json:"target_title,omitempty"`

	// TopicID is the routing key the frontend uses to build the
	// click-through URL. Always populated (both for topic- and
	// post-scoped notifications) so the client never has to guess
	// whether TargetID refers to a topic or a post. Zero for
	// non-forum notification types (follow, system) where no
	// deep-link makes sense.
	TopicID int64 `gorm:"index" json:"topic_id,omitempty"`

	// PostFloor is the reply floor to anchor onto within the topic
	// page. Non-zero only for post-scoped notifications; the
	// frontend appends it as `#floor-{N}` so the user lands at the
	// exact reply that triggered the event.
	PostFloor int `json:"post_floor,omitempty"`
	Text          string    `gorm:"size:128" json:"text"`
	Preview       string    `gorm:"size:512" json:"preview,omitempty"`
	Read          bool      `gorm:"default:false;index" json:"read"`
	CreatedAt     time.Time `gorm:"autoCreateTime;index" json:"created_at"`
}

func (Notification) TableName() string { return "notifications" }

const (
	TypeReply   = "reply"
	TypeLike    = "like"
	TypeMention = "mention"
	TypeFollow  = "follow"
	TypeSystem  = "system"
)
