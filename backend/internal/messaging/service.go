package messaging

import (
	"errors"
	"strings"
	"unicode/utf8"
)

var (
	ErrEmpty       = errors.New("message content is empty")
	ErrTooLong     = errors.New("message content too long")
	ErrSelfMessage = errors.New("cannot message yourself")
	ErrUserMissing = errors.New("recipient does not exist")
)

const (
	MaxMessageLen = 2000
	ExcerptLen    = 120
)

// UserLookup is the narrow interface messaging needs from the user package
// to validate that a recipient actually exists.
type UserLookup interface {
	Exists(id int64) (bool, error)
	UsernameByID(id int64) (string, error)
}

// Notifier emits a notification to the recipient when a new message arrives.
type Notifier interface {
	NotifyDirectMessage(recipientID, senderID int64, senderUsername, preview string)
}

// Publisher pushes the freshly-persisted Message to real-time subscribers.
// Wired by main.go to the stream hub.
type Publisher interface {
	PublishMessage(recipientID int64, msg *Message, conv *Conversation)
}

type Service struct {
	repo      *Repository
	users     UserLookup
	notifier  Notifier
	publisher Publisher
}

func NewService(repo *Repository, users UserLookup) *Service {
	return &Service{repo: repo, users: users}
}

func (s *Service) SetNotifier(n Notifier)   { s.notifier = n }
func (s *Service) SetPublisher(p Publisher) { s.publisher = p }

// Send delivers a message from senderID to recipientID, creating the
// conversation if necessary. Returns the new Message and the canonical
// Conversation row.
func (s *Service) Send(senderID, recipientID int64, content string) (*Conversation, *Message, error) {
	if senderID == 0 || recipientID == 0 {
		return nil, nil, ErrUserMissing
	}
	if senderID == recipientID {
		return nil, nil, ErrSelfMessage
	}
	content = strings.TrimSpace(content)
	if utf8.RuneCountInString(content) == 0 {
		return nil, nil, ErrEmpty
	}
	if utf8.RuneCountInString(content) > MaxMessageLen {
		return nil, nil, ErrTooLong
	}
	if exists, err := s.users.Exists(recipientID); err != nil {
		return nil, nil, err
	} else if !exists {
		return nil, nil, ErrUserMissing
	}

	conv, err := s.repo.FindOrCreate(senderID, recipientID)
	if err != nil {
		return nil, nil, err
	}
	excerpt := truncateRunes(content, ExcerptLen)
	msg, err := s.repo.Send(conv.ID, senderID, content, excerpt)
	if err != nil {
		return nil, nil, err
	}

	if s.notifier != nil {
		senderName, _ := s.users.UsernameByID(senderID)
		s.notifier.NotifyDirectMessage(recipientID, senderID, senderName, excerpt)
	}
	if s.publisher != nil {
		// Push to the recipient so their open conversation/thread appends in
		// real time, and to the sender so multi-tab stays in sync.
		s.publisher.PublishMessage(recipientID, msg, conv)
		s.publisher.PublishMessage(senderID, msg, conv)
	}
	return conv, msg, nil
}

func truncateRunes(s string, max int) string {
	if utf8.RuneCountInString(s) <= max {
		return s
	}
	runes := []rune(s)
	return string(runes[:max])
}

// OpenConversation looks up (or creates) a conversation between two users
// and verifies the viewer is one of the participants.
func (s *Service) OpenConversation(viewerID, otherID int64) (*Conversation, error) {
	if viewerID == 0 || otherID == 0 || viewerID == otherID {
		return nil, ErrSelfMessage
	}
	if exists, err := s.users.Exists(otherID); err != nil {
		return nil, err
	} else if !exists {
		return nil, ErrUserMissing
	}
	return s.repo.FindOrCreate(viewerID, otherID)
}

func (s *Service) Messages(viewerID, convID, before int64, limit int) ([]Message, error) {
	c, err := s.repo.ByID(convID)
	if err != nil || c == nil {
		return nil, ErrNotParticipant
	}
	if !s.repo.IsParticipant(c, viewerID) {
		return nil, ErrNotParticipant
	}
	return s.repo.Messages(convID, before, limit)
}

// ConversationView pairs a conversation row with its other-participant
// username and per-viewer unread count, used by /api/messages/conversations.
type ConversationView struct {
	*Conversation
	OtherUserID  int64  `json:"other_user_id"`
	OtherUsername string `json:"other_username"`
	UnreadCount  int    `json:"unread_count"`
}

func (s *Service) ListByUser(viewerID int64, limit int) ([]ConversationView, error) {
	convs, err := s.repo.ListByUser(viewerID, limit)
	if err != nil {
		return nil, err
	}
	if len(convs) == 0 {
		return nil, nil
	}
	ids := make([]int64, len(convs))
	for i, c := range convs {
		ids[i] = c.ID
	}
	unread, err := s.repo.UnreadByConversation(viewerID, ids)
	if err != nil {
		return nil, err
	}
	out := make([]ConversationView, 0, len(convs))
	for i := range convs {
		c := &convs[i]
		other := c.Other(viewerID)
		username, _ := s.users.UsernameByID(other)
		out = append(out, ConversationView{
			Conversation:  c,
			OtherUserID:   other,
			OtherUsername: username,
			UnreadCount:   unread[c.ID],
		})
	}
	return out, nil
}

func (s *Service) MarkRead(viewerID, convID int64) error {
	c, err := s.repo.ByID(convID)
	if err != nil || c == nil {
		return ErrNotParticipant
	}
	if !s.repo.IsParticipant(c, viewerID) {
		return ErrNotParticipant
	}
	return s.repo.MarkRead(convID, viewerID)
}

func (s *Service) CountUnread(viewerID int64) (int64, error) {
	return s.repo.CountUnread(viewerID)
}

// ---------- Admin ----------

// AdminConversationView is the shape returned by the admin list endpoint.
// Both participant usernames are attached since an admin is always
// inspecting someone else's conversation — there's no "viewer" to pivot
// around.
type AdminConversationView struct {
	*Conversation
	UserAUsername string `json:"user_a_username"`
	UserBUsername string `json:"user_b_username"`
}

func (s *Service) AdminListConversations(opts AdminListOptions) ([]AdminConversationView, int64, error) {
	items, total, err := s.repo.AdminListConversations(opts)
	if err != nil {
		return nil, 0, err
	}
	out := make([]AdminConversationView, 0, len(items))
	for i := range items {
		c := &items[i]
		aName, _ := s.users.UsernameByID(c.UserAID)
		bName, _ := s.users.UsernameByID(c.UserBID)
		out = append(out, AdminConversationView{
			Conversation:  c,
			UserAUsername: aName,
			UserBUsername: bName,
		})
	}
	return out, total, nil
}

// AdminConversationDetail returns a single conversation with participant
// usernames and the full ordered message list (up to 500 messages —
// enough for moderation review without inviting runaway queries).
type AdminConversationDetail struct {
	AdminConversationView
	Messages []Message `json:"messages"`
}

func (s *Service) AdminConversationDetail(convID int64) (*AdminConversationDetail, error) {
	c, err := s.repo.ByID(convID)
	if err != nil {
		return nil, err
	}
	if c == nil {
		return nil, ErrNotParticipant
	}
	msgs, err := s.repo.Messages(convID, 0, 500)
	if err != nil {
		return nil, err
	}
	aName, _ := s.users.UsernameByID(c.UserAID)
	bName, _ := s.users.UsernameByID(c.UserBID)
	return &AdminConversationDetail{
		AdminConversationView: AdminConversationView{
			Conversation:  c,
			UserAUsername: aName,
			UserBUsername: bName,
		},
		Messages: msgs,
	}, nil
}
