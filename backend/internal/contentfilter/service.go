package contentfilter

import (
	"errors"
	"strings"
	"sync"
	"time"
	"unicode/utf8"
)

var (
	ErrEmptyWord    = errors.New("word cannot be empty")
	ErrWordTooLong  = errors.New("word is too long")
	ErrInvalidLevel = errors.New("invalid severity")
	ErrBlocked      = errors.New("content blocked by filter")
)

// Hit is the structured result of a Check call. Hits with severity=block
// cause the calling forum action to fail; warn-level hits are returned for
// future moderation use but do not block.
type Hit struct {
	Word     string `json:"word"`
	Severity string `json:"severity"`
}

type Service struct {
	repo *Repository

	mu       sync.RWMutex
	cache    []Word
	loadedAt time.Time
}

func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

// reload pulls the live enabled list from the DB. Called lazily when the
// cache is stale (>30s) or after a write so admins see effects immediately.
func (s *Service) reload() error {
	items, err := s.repo.ListEnabled()
	if err != nil {
		return err
	}
	s.mu.Lock()
	s.cache = items
	s.loadedAt = time.Now()
	s.mu.Unlock()
	return nil
}

func (s *Service) ensureCache() {
	s.mu.RLock()
	stale := time.Since(s.loadedAt) > 30*time.Second
	empty := s.cache == nil
	s.mu.RUnlock()
	if stale || empty {
		_ = s.reload()
	}
}

// Check scans the given text against the enabled blacklist and returns every
// matching word. Matching is lower-case substring on a single line — fine for
// short blacklists; can swap to Aho-Corasick later if the list grows large.
func (s *Service) Check(text string) []Hit {
	s.ensureCache()
	s.mu.RLock()
	defer s.mu.RUnlock()
	if len(s.cache) == 0 || text == "" {
		return nil
	}
	lower := strings.ToLower(text)
	out := make([]Hit, 0, 4)
	for _, w := range s.cache {
		if strings.Contains(lower, strings.ToLower(w.Word)) {
			out = append(out, Hit{Word: w.Word, Severity: w.Severity})
		}
	}
	return out
}

// HasBlockingHit returns true when at least one matched word has severity=block.
func HasBlockingHit(hits []Hit) bool {
	for _, h := range hits {
		if h.Severity == SeverityBlock {
			return true
		}
	}
	return false
}

// ---------- Admin CRUD ----------

func validate(w *Word) error {
	w.Word = strings.TrimSpace(w.Word)
	if w.Word == "" {
		return ErrEmptyWord
	}
	if utf8.RuneCountInString(w.Word) > 64 {
		return ErrWordTooLong
	}
	if w.Severity == "" {
		w.Severity = SeverityBlock
	}
	if w.Severity != SeverityBlock && w.Severity != SeverityWarn {
		return ErrInvalidLevel
	}
	return nil
}

func (s *Service) Create(w *Word) error {
	if err := validate(w); err != nil {
		return err
	}
	if err := s.repo.Create(w); err != nil {
		return err
	}
	_ = s.reload()
	return nil
}

func (s *Service) Update(w *Word) error {
	if err := validate(w); err != nil {
		return err
	}
	if err := s.repo.Update(w); err != nil {
		return err
	}
	_ = s.reload()
	return nil
}

func (s *Service) Delete(id int64) error {
	if err := s.repo.Delete(id); err != nil {
		return err
	}
	_ = s.reload()
	return nil
}

func (s *Service) List() ([]Word, error) {
	return s.repo.List()
}

func (s *Service) ByID(id int64) (*Word, error) {
	return s.repo.ByID(id)
}
