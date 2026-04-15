package messaging

import "time"

// Conversation is a 1:1 thread between two users. Participant ids are stored
// in canonical order (UserAID < UserBID) so a given pair maps to exactly one
// row regardless of who DMs first.
type Conversation struct {
	ID                 int64     `gorm:"primaryKey" json:"id"`
	UserAID            int64     `gorm:"not null;index:idx_conv_pair,unique,priority:1" json:"user_a_id"`
	UserBID            int64     `gorm:"not null;index:idx_conv_pair,unique,priority:2" json:"user_b_id"`
	LastMessageAt      time.Time `gorm:"index" json:"last_message_at"`
	LastMessageExcerpt string    `gorm:"size:256" json:"last_message_excerpt"`
	LastSenderID       int64     `json:"last_sender_id"`
	CreatedAt          time.Time `gorm:"autoCreateTime" json:"created_at"`
}

func (Conversation) TableName() string { return "conversations" }

// Other returns the participant id that is NOT viewerID.
func (c *Conversation) Other(viewerID int64) int64 {
	if c.UserAID == viewerID {
		return c.UserBID
	}
	return c.UserAID
}

// Message is one entry in a conversation. read_at is set when the recipient
// (i.e. anyone who is not the sender) opens the thread.
type Message struct {
	ID             int64      `gorm:"primaryKey" json:"id"`
	ConversationID int64      `gorm:"index;not null" json:"conversation_id"`
	SenderID       int64      `gorm:"index;not null" json:"sender_id"`
	Content        string     `gorm:"type:text;not null" json:"content"`
	ReadAt         *time.Time `json:"read_at,omitempty"`
	CreatedAt      time.Time  `gorm:"autoCreateTime;index" json:"created_at"`
}

func (Message) TableName() string { return "messages" }
