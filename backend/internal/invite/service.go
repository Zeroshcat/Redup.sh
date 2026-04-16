package invite

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"strings"
	"time"
	"unicode/utf8"
)

var (
	ErrInvalidCode = errors.New("invalid invite code")
	ErrCodeExpired = errors.New("invite code expired or fully used")
	ErrCodeNotFound = errors.New("invite code not found")
)

type Service struct {
	repo *Repository
}

func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

// Generate creates a new invite code. maxUses=0 means single-use (defaults
// to 1). expiresIn=0 means no expiry. Returns the persisted Code.
func (s *Service) Generate(creatorID int64, creatorName string, maxUses int, note string, expiresIn time.Duration) (*Code, error) {
	if maxUses <= 0 {
		maxUses = 1
	}
	note = strings.TrimSpace(note)
	if utf8.RuneCountInString(note) > 256 {
		runes := []rune(note)
		note = string(runes[:256])
	}
	code := randomCode()
	c := &Code{
		Code:        code,
		CreatorID:   creatorID,
		CreatorName: creatorName,
		MaxUses:     maxUses,
		Note:        note,
	}
	if expiresIn > 0 {
		t := time.Now().Add(expiresIn)
		c.ExpiresAt = &t
	}
	if err := s.repo.Create(c); err != nil {
		return nil, err
	}
	return c, nil
}

// Validate checks if a code string is valid and still usable without
// consuming it. Used by the registration flow to pre-validate before
// creating the user.
func (s *Service) Validate(code string) error {
	code = strings.TrimSpace(strings.ToUpper(code))
	if code == "" {
		return ErrInvalidCode
	}
	c, err := s.repo.FindByCode(code)
	if err != nil {
		return err
	}
	if c == nil {
		return ErrCodeNotFound
	}
	if c.ExpiresAt != nil && c.ExpiresAt.Before(time.Now()) {
		return ErrCodeExpired
	}
	if c.UsedCount >= c.MaxUses {
		return ErrCodeExpired
	}
	return nil
}

// Consume validates and atomically consumes one use of the code. Called
// after user creation succeeds so we don't waste a use on a failed
// registration.
func (s *Service) Consume(code string, userID int64, username string) error {
	code = strings.TrimSpace(strings.ToUpper(code))
	if code == "" {
		return ErrInvalidCode
	}
	ok, err := s.repo.Consume(code, userID, username)
	if err != nil {
		return err
	}
	if !ok {
		return ErrCodeExpired
	}
	return nil
}

func (s *Service) List(opts ListOptions) ([]Code, int64, error) {
	return s.repo.List(opts)
}

func (s *Service) Usages(codeID int64) ([]Usage, error) {
	return s.repo.UsagesForCode(codeID)
}

func (s *Service) Delete(id int64) error {
	c, err := s.repo.FindByID(id)
	if err != nil {
		return err
	}
	if c == nil {
		return ErrCodeNotFound
	}
	return s.repo.Delete(id)
}

func randomCode() string {
	b := make([]byte, 6)
	_, _ = rand.Read(b)
	return strings.ToUpper(hex.EncodeToString(b))
}
