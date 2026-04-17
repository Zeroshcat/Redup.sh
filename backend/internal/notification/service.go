package notification

import (
	"log"
	"unicode/utf8"
)

// Publisher is the narrow interface the notification service needs to fan
// a new notification out to real-time subscribers. Wired by main.go to the
// stream hub.
type Publisher interface {
	PublishNotification(userID int64, notif *Notification)
}

type Service struct {
	repo      *Repository
	publisher Publisher
}

func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

func (s *Service) SetPublisher(p Publisher) { s.publisher = p }

// Input is the action-specific subset producers fill in. The recipient is
// always required; everything else is optional.
type Input struct {
	RecipientID   int64
	Type          string
	ActorUserID   int64
	ActorUsername string
	ActorIsAnon   bool
	TargetType    string
	TargetID      int64
	TargetTitle   string
	// TopicID + PostFloor together drive the click-through URL on
	// the frontend — /topic/{TopicID}#floor-{PostFloor} if floor
	// is non-zero, /topic/{TopicID} otherwise. TopicID must be
	// set for any notification the user should be able to click
	// into; leaving it zero yields a dead link.
	TopicID   int64
	PostFloor int
	Text      string
	Preview   string
}

// Notify is best-effort: producers should never let a notification failure
// break the user-visible action. Logs and swallows errors.
func (s *Service) Notify(in Input) {
	if s == nil || s.repo == nil || in.RecipientID == 0 {
		return
	}
	// Don't notify yourself about your own actions.
	if in.ActorUserID == in.RecipientID && !in.ActorIsAnon {
		return
	}
	in.TargetTitle = truncRunes(in.TargetTitle, 200)
	in.Preview = truncRunes(in.Preview, 200)
	n := &Notification{
		RecipientID:   in.RecipientID,
		Type:          in.Type,
		ActorUserID:   in.ActorUserID,
		ActorUsername: in.ActorUsername,
		ActorIsAnon:   in.ActorIsAnon,
		TargetType:    in.TargetType,
		TargetID:      in.TargetID,
		TargetTitle:   in.TargetTitle,
		TopicID:       in.TopicID,
		PostFloor:     in.PostFloor,
		Text:          in.Text,
		Preview:       in.Preview,
	}
	if err := s.repo.Create(n); err != nil {
		log.Printf("notification: failed to deliver to user %d: %v", in.RecipientID, err)
		return
	}
	if s.publisher != nil {
		s.publisher.PublishNotification(in.RecipientID, n)
	}
}

func (s *Service) List(opts ListOptions) ([]Notification, error) {
	return s.repo.List(opts)
}

func (s *Service) CountUnread(userID int64) (int64, error) {
	return s.repo.CountUnread(userID)
}

func (s *Service) MarkRead(userID, id int64) error {
	return s.repo.MarkRead(userID, id)
}

func (s *Service) MarkAllRead(userID int64) error {
	return s.repo.MarkAllRead(userID)
}

// ---------- Admin ----------

func (s *Service) AdminList(opts AdminListOptions) ([]Notification, int64, error) {
	return s.repo.AdminList(opts)
}

func (s *Service) StatsByType() ([]TypeStat, error) {
	return s.repo.StatsByType()
}

func truncRunes(s string, max int) string {
	if utf8.RuneCountInString(s) <= max {
		return s
	}
	runes := []rune(s)
	return string(runes[:max])
}
