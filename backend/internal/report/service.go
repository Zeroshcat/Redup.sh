package report

import (
	"errors"
	"log"
	"strings"
	"time"
	"unicode/utf8"
)

var (
	ErrInvalidTarget    = errors.New("invalid target")
	ErrInvalidReason    = errors.New("invalid reason")
	ErrInvalidStatus    = errors.New("invalid status")
	ErrDescriptionLong  = errors.New("description too long")
	ErrDuplicate        = errors.New("duplicate report")
	ErrReportNotFound   = errors.New("report not found")
	ErrAlreadyHandled   = errors.New("report already handled")
)

// Notifier is the narrow interface report needs to push a notification to the
// original reporter when their submission is handled. Wired by main.go.
type Notifier interface {
	NotifyReportHandled(recipientID int64, resolved bool, targetTitle, note string)
}

// Publisher pushes newly-created or handled reports out over the real-time
// stream so connected admin clients see queue updates without polling.
// Implementations must be non-blocking — called from the submit/handle hot
// paths.
type Publisher interface {
	PublishReportCreated(rep *Report)
	PublishReportResolved(rep *Report)
}

type Service struct {
	repo      *Repository
	notifier  Notifier
	publisher Publisher
	penalizer CreditPenalizer
}

func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

func (s *Service) SetNotifier(n Notifier)               { s.notifier = n }
func (s *Service) SetPublisher(p Publisher)             { s.publisher = p }
func (s *Service) SetCreditPenalizer(p CreditPenalizer) { s.penalizer = p }

func validReason(r string) bool {
	switch r {
	case ReasonSpam, ReasonHarassment, ReasonIllegal, ReasonPrivacy, ReasonOther:
		return true
	}
	return false
}

func validTarget(t string) bool {
	switch t {
	case TargetTopic, TargetPost, TargetUser:
		return true
	}
	return false
}

type SubmitInput struct {
	ReporterID       int64
	ReporterUsername string
	TargetType       string
	TargetID         int64
	TargetTitle      string
	Reason           string
	Description      string
}

func (s *Service) Submit(in SubmitInput) (*Report, error) {
	if !validTarget(in.TargetType) || in.TargetID <= 0 {
		return nil, ErrInvalidTarget
	}
	if !validReason(in.Reason) {
		return nil, ErrInvalidReason
	}
	in.Description = strings.TrimSpace(in.Description)
	if utf8.RuneCountInString(in.Description) > 500 {
		return nil, ErrDescriptionLong
	}
	in.TargetTitle = strings.TrimSpace(in.TargetTitle)
	if r := utf8.RuneCountInString(in.TargetTitle); r > 200 {
		runes := []rune(in.TargetTitle)
		in.TargetTitle = string(runes[:200])
	}

	dup, err := s.repo.HasPendingByReporter(in.ReporterID, in.TargetType, in.TargetID)
	if err != nil {
		return nil, err
	}
	if dup {
		return nil, ErrDuplicate
	}

	rep := &Report{
		ReporterUserID:   in.ReporterID,
		ReporterUsername: in.ReporterUsername,
		TargetType:       in.TargetType,
		TargetID:         in.TargetID,
		TargetTitle:      in.TargetTitle,
		Reason:           in.Reason,
		Description:      in.Description,
		Status:           StatusPending,
	}
	if err := s.repo.Create(rep); err != nil {
		return nil, err
	}
	if s.publisher != nil {
		s.publisher.PublishReportCreated(rep)
	}
	return rep, nil
}

// SubmitSystem files a report from the platform itself (reporter_id=0). Used
// by moderation auto-flag when a user accumulates too many warnings. Dedupes
// so repeated triggers don't spam the queue with duplicate rows — if there's
// already a pending system report against the same user, this is a no-op.
func (s *Service) SubmitSystem(targetUserID int64, reason, note string) error {
	if targetUserID == 0 {
		return ErrInvalidTarget
	}
	if !validReason(reason) {
		return ErrInvalidReason
	}
	dup, err := s.repo.HasPendingByReporter(0, TargetUser, targetUserID)
	if err != nil {
		return err
	}
	if dup {
		return nil
	}
	note = strings.TrimSpace(note)
	if utf8.RuneCountInString(note) > 500 {
		runes := []rune(note)
		note = string(runes[:500])
	}
	rep := &Report{
		ReporterUserID:   0,
		ReporterUsername: "系统",
		TargetType:       TargetUser,
		TargetID:         targetUserID,
		TargetTitle:      "@自动标记",
		Reason:           reason,
		Description:      note,
		Status:           StatusPending,
	}
	if err := s.repo.Create(rep); err != nil {
		return err
	}
	if s.publisher != nil {
		s.publisher.PublishReportCreated(rep)
	}
	return nil
}

func (s *Service) List(opts ListOptions) ([]Report, error) {
	if opts.Status != "" {
		switch opts.Status {
		case StatusPending, StatusResolved, StatusDismissed:
		default:
			return nil, ErrInvalidStatus
		}
	}
	return s.repo.List(opts)
}

func (s *Service) Counts() (StatusCounts, error) {
	return s.repo.Counts()
}

type HandleInput struct {
	HandlerID       int64
	HandlerUsername string
	Note            string
	// CreditScoreDelta is an optional signed adjustment applied to the
	// reported target's credit score when the report is Resolved. Positive
	// restores, negative penalizes. Zero skips. Ignored on Dismiss.
	CreditScoreDelta int
}

// CreditPenalizer resolves a report target (user / topic / post) to its
// owning user and applies a credit-score delta. Kept as a narrow interface
// so the report service doesn't import user / forum directly.
type CreditPenalizer interface {
	PenalizeReportTarget(targetType string, targetID int64, delta int) error
}

func (s *Service) handle(id int64, status string, in HandleInput) (*Report, error) {
	rep, err := s.repo.ByID(id)
	if err != nil {
		return nil, err
	}
	if rep == nil {
		return nil, ErrReportNotFound
	}
	if rep.Status != StatusPending {
		return nil, ErrAlreadyHandled
	}
	note := strings.TrimSpace(in.Note)
	if r := utf8.RuneCountInString(note); r > 500 {
		runes := []rune(note)
		note = string(runes[:500])
	}
	now := time.Now()
	rep.Status = status
	rep.HandlerUserID = &in.HandlerID
	rep.HandlerUsername = in.HandlerUsername
	rep.ResolutionNote = note
	rep.HandledAt = &now
	if err := s.repo.UpdateStatus(rep); err != nil {
		return nil, err
	}
	if status == StatusResolved && in.CreditScoreDelta != 0 && s.penalizer != nil {
		// Best-effort: a penalizer failure shouldn't block the resolve
		// itself, but we capture it in the note so the admin can see it.
		if err := s.penalizer.PenalizeReportTarget(rep.TargetType, rep.TargetID, in.CreditScoreDelta); err != nil {
			rep.ResolutionNote = strings.TrimSpace(rep.ResolutionNote+" [credit penalty failed: "+err.Error()+"]")
			if updateErr := s.repo.UpdateStatus(rep); updateErr != nil {
				log.Printf("report: failed to save penalty note: report=%d err=%v", rep.ID, updateErr)
			}
		}
	}
	if s.notifier != nil && rep.ReporterUserID != 0 {
		s.notifier.NotifyReportHandled(rep.ReporterUserID, status == StatusResolved, rep.TargetTitle, note)
	}
	if s.publisher != nil {
		s.publisher.PublishReportResolved(rep)
	}
	return rep, nil
}

func (s *Service) Resolve(id int64, in HandleInput) (*Report, error) {
	return s.handle(id, StatusResolved, in)
}

func (s *Service) Dismiss(id int64, in HandleInput) (*Report, error) {
	return s.handle(id, StatusDismissed, in)
}
