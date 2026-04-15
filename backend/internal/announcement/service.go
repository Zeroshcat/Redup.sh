package announcement

import (
	"errors"
	"strings"
	"time"
	"unicode/utf8"
)

var (
	ErrNotFound        = errors.New("announcement not found")
	ErrInvalidTitle    = errors.New("invalid title")
	ErrInvalidContent  = errors.New("invalid content")
	ErrInvalidPlacement = errors.New("invalid placement")
	ErrInvalidLevel    = errors.New("invalid level")
	ErrInvalidTimeRange = errors.New("end must be after start")
)

type Service struct {
	repo *Repository
}

func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

// Input is the write-shape accepted by both Create and Update. Keeping one
// shape means field validation lives in one place.
type Input struct {
	Title       string
	Content     string
	Placement   string
	Level       string
	StartAt     *time.Time
	EndAt       *time.Time
	Published   bool
	Dismissible bool
}

func (s *Service) validate(in *Input) error {
	in.Title = strings.TrimSpace(in.Title)
	if n := utf8.RuneCountInString(in.Title); n == 0 || n > 200 {
		return ErrInvalidTitle
	}
	in.Content = strings.TrimSpace(in.Content)
	if n := utf8.RuneCountInString(in.Content); n == 0 || n > 5000 {
		return ErrInvalidContent
	}
	switch in.Placement {
	case PlacementTopBanner, PlacementHomeCard, PlacementInbox:
	default:
		return ErrInvalidPlacement
	}
	if in.Level == "" {
		in.Level = LevelInfo
	}
	switch in.Level {
	case LevelInfo, LevelSuccess, LevelWarning, LevelDanger:
	default:
		return ErrInvalidLevel
	}
	if in.StartAt != nil && in.EndAt != nil && in.EndAt.Before(*in.StartAt) {
		return ErrInvalidTimeRange
	}
	return nil
}

func (s *Service) Create(in Input) (*Announcement, error) {
	if err := s.validate(&in); err != nil {
		return nil, err
	}
	a := &Announcement{
		Title:       in.Title,
		Content:     in.Content,
		Placement:   in.Placement,
		Level:       in.Level,
		StartAt:     in.StartAt,
		EndAt:       in.EndAt,
		Published:   in.Published,
		Dismissible: in.Dismissible,
	}
	if err := s.repo.Create(a); err != nil {
		return nil, err
	}
	return a, nil
}

func (s *Service) Update(id int64, in Input) (*Announcement, error) {
	if err := s.validate(&in); err != nil {
		return nil, err
	}
	existing, err := s.repo.ByID(id)
	if err != nil {
		return nil, err
	}
	if existing == nil {
		return nil, ErrNotFound
	}
	existing.Title = in.Title
	existing.Content = in.Content
	existing.Placement = in.Placement
	existing.Level = in.Level
	existing.StartAt = in.StartAt
	existing.EndAt = in.EndAt
	existing.Published = in.Published
	existing.Dismissible = in.Dismissible
	if err := s.repo.Update(existing); err != nil {
		return nil, err
	}
	return existing, nil
}

// SetPublished toggles the publish flag without requiring the caller to
// resend the whole payload. This is what the "发布 / 下线" button on the
// admin panel calls.
func (s *Service) SetPublished(id int64, published bool) (*Announcement, error) {
	existing, err := s.repo.ByID(id)
	if err != nil {
		return nil, err
	}
	if existing == nil {
		return nil, ErrNotFound
	}
	existing.Published = published
	if err := s.repo.Update(existing); err != nil {
		return nil, err
	}
	return existing, nil
}

func (s *Service) Delete(id int64) error {
	existing, err := s.repo.ByID(id)
	if err != nil {
		return err
	}
	if existing == nil {
		return ErrNotFound
	}
	return s.repo.Delete(id)
}

func (s *Service) ListAll() ([]Announcement, error) {
	return s.repo.ListAll()
}

func (s *Service) ListActive(placement string) ([]Announcement, error) {
	return s.repo.ListActive(placement)
}
