package messaging

import (
	"errors"
	"time"

	"gorm.io/gorm"
)

var ErrNotParticipant = errors.New("not a participant of this conversation")

type Repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

func canonical(a, b int64) (int64, int64) {
	if a > b {
		return b, a
	}
	return a, b
}

// FindOrCreate looks up the conversation between two users (in any order)
// and creates one if it doesn't exist. Idempotent.
func (r *Repository) FindOrCreate(viewerID, otherID int64) (*Conversation, error) {
	a, b := canonical(viewerID, otherID)
	var c Conversation
	err := r.db.Where("user_a_id = ? AND user_b_id = ?", a, b).First(&c).Error
	if err == nil {
		return &c, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	c = Conversation{UserAID: a, UserBID: b, LastMessageAt: time.Now()}
	if err := r.db.Create(&c).Error; err != nil {
		// Race: another request created the row in between. Refetch.
		if err2 := r.db.Where("user_a_id = ? AND user_b_id = ?", a, b).First(&c).Error; err2 == nil {
			return &c, nil
		}
		return nil, err
	}
	return &c, nil
}

func (r *Repository) ByID(id int64) (*Conversation, error) {
	var c Conversation
	if err := r.db.First(&c, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &c, nil
}

func (r *Repository) IsParticipant(c *Conversation, userID int64) bool {
	return c.UserAID == userID || c.UserBID == userID
}

// Send appends a message to a conversation in one transaction, updating the
// conversation's last-message snapshot. Returns the persisted Message row.
func (r *Repository) Send(convID, senderID int64, content, excerpt string) (*Message, error) {
	var msg Message
	err := r.db.Transaction(func(tx *gorm.DB) error {
		msg = Message{
			ConversationID: convID,
			SenderID:       senderID,
			Content:        content,
		}
		if err := tx.Create(&msg).Error; err != nil {
			return err
		}
		now := time.Now()
		return tx.Model(&Conversation{}).Where("id = ?", convID).Updates(map[string]interface{}{
			"last_message_at":      now,
			"last_message_excerpt": excerpt,
			"last_sender_id":       senderID,
		}).Error
	})
	if err != nil {
		return nil, err
	}
	return &msg, nil
}

// ListByUser returns all conversations the user is part of, newest first.
func (r *Repository) ListByUser(userID int64, limit int) ([]Conversation, error) {
	if limit <= 0 {
		limit = 100
	}
	var items []Conversation
	err := r.db.Where("user_a_id = ? OR user_b_id = ?", userID, userID).
		Order("last_message_at DESC").
		Limit(limit).
		Find(&items).Error
	return items, err
}

// Messages returns messages for a conversation in ascending order. before is
// an optional message id for cursor pagination — 0 means latest page.
func (r *Repository) Messages(convID int64, before int64, limit int) ([]Message, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	q := r.db.Where("conversation_id = ?", convID)
	if before > 0 {
		q = q.Where("id < ?", before)
	}
	var items []Message
	err := q.Order("id DESC").Limit(limit).Find(&items).Error
	if err != nil {
		return nil, err
	}
	// Reverse so the caller gets ascending chronological order.
	for i, j := 0, len(items)-1; i < j; i, j = i+1, j-1 {
		items[i], items[j] = items[j], items[i]
	}
	return items, nil
}

// MarkRead stamps every unread message NOT sent by the viewer as read.
func (r *Repository) MarkRead(convID, viewerID int64) error {
	now := time.Now()
	return r.db.Model(&Message{}).
		Where("conversation_id = ? AND sender_id <> ? AND read_at IS NULL", convID, viewerID).
		Update("read_at", now).Error
}

// CountUnread returns the total number of unread messages addressed to the
// given user across all their conversations.
func (r *Repository) CountUnread(userID int64) (int64, error) {
	var n int64
	err := r.db.Model(&Message{}).
		Joins("JOIN conversations c ON c.id = messages.conversation_id").
		Where("(c.user_a_id = ? OR c.user_b_id = ?) AND messages.sender_id <> ? AND messages.read_at IS NULL",
			userID, userID, userID).
		Count(&n).Error
	return n, err
}

// ---------- Admin queries ----------

// AdminListOptions controls the admin conversation-browser view. An empty
// ParticipantID returns every conversation in the system; otherwise the
// filter matches either side of the canonical (user_a, user_b) pair.
type AdminListOptions struct {
	ParticipantID int64
	Limit         int
	Offset        int
}

// AdminListConversations returns conversations ordered by most-recent
// activity. Used by the /admin/messages list. Returns total so the UI can
// paginate.
func (r *Repository) AdminListConversations(opts AdminListOptions) ([]Conversation, int64, error) {
	q := r.db.Model(&Conversation{})
	if opts.ParticipantID > 0 {
		q = q.Where("user_a_id = ? OR user_b_id = ?", opts.ParticipantID, opts.ParticipantID)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	if opts.Limit <= 0 || opts.Limit > 200 {
		opts.Limit = 50
	}
	q = q.Order("last_message_at DESC").Limit(opts.Limit).Offset(opts.Offset)
	var items []Conversation
	if err := q.Find(&items).Error; err != nil {
		return nil, 0, err
	}
	return items, total, nil
}

// UnreadByConversation returns a map of conversation_id → unread count for
// the given user. Used to hydrate the conversation list.
func (r *Repository) UnreadByConversation(userID int64, convIDs []int64) (map[int64]int, error) {
	out := make(map[int64]int, len(convIDs))
	if len(convIDs) == 0 {
		return out, nil
	}
	rows := []struct {
		ConversationID int64
		N              int64
	}{}
	if err := r.db.Model(&Message{}).
		Select("conversation_id, COUNT(*) AS n").
		Where("conversation_id IN ? AND sender_id <> ? AND read_at IS NULL", convIDs, userID).
		Group("conversation_id").
		Scan(&rows).Error; err != nil {
		return nil, err
	}
	for _, r := range rows {
		out[r.ConversationID] = int(r.N)
	}
	return out, nil
}
