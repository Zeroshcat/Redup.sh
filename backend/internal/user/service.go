package user

import (
	"errors"
	"regexp"
	"strings"

	"golang.org/x/crypto/bcrypt"
)

var (
	ErrUsernameTaken     = errors.New("username already taken")
	ErrEmailTaken        = errors.New("email already taken")
	ErrInvalidUsername   = errors.New("invalid username")
	ErrInvalidEmail      = errors.New("invalid email")
	ErrWeakPassword      = errors.New("password too weak")
	ErrInvalidCredential = errors.New("invalid credentials")
	ErrUserNotFound      = errors.New("user not found")
	ErrAccountDisabled   = errors.New("account disabled")
)

var (
	usernameRegex = regexp.MustCompile(`^[a-zA-Z][a-zA-Z0-9_-]{2,31}$`)
	emailRegex    = regexp.MustCompile(`^[^\s@]+@[^\s@]+\.[^\s@]+$`)
)

// CreditsAwarder is the narrow interface the user service needs to grant the
// signup bonus. Wired by main.go and may be nil in tests.
type CreditsAwarder interface {
	Award(userID int64, kind, refType string, refID int64, note string)
}

type Service struct {
	repo       *Repository
	credits    CreditsAwarder
	loginGuard LoginGuard
}

func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

func (s *Service) SetCreditsAwarder(c CreditsAwarder) { s.credits = c }

type RegisterInput struct {
	Username string
	Email    string
	Password string
}

func (s *Service) Register(in RegisterInput) (*User, error) {
	in.Username = strings.TrimSpace(in.Username)
	in.Email = strings.ToLower(strings.TrimSpace(in.Email))

	if !usernameRegex.MatchString(in.Username) {
		return nil, ErrInvalidUsername
	}
	if !emailRegex.MatchString(in.Email) {
		return nil, ErrInvalidEmail
	}
	if len(in.Password) < 8 {
		return nil, ErrWeakPassword
	}

	if existing, err := s.repo.FindByUsername(in.Username); err != nil {
		return nil, err
	} else if existing != nil {
		return nil, ErrUsernameTaken
	}
	if existing, err := s.repo.FindByEmail(in.Email); err != nil {
		return nil, err
	} else if existing != nil {
		return nil, ErrEmailTaken
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(in.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}

	u := &User{
		Username:     in.Username,
		Email:        in.Email,
		PasswordHash: string(hash),
		CreditScore:  100,
		Level:        1,
		Role:         "user",
		Status:       "active",
	}
	if err := s.repo.CreateWithFirstAdminBootstrap(u); err != nil {
		return nil, err
	}
	if s.credits != nil {
		s.credits.Award(u.ID, "signup_bonus", "user", u.ID, "新用户注册礼包")
	}
	return u, nil
}

type LoginInput struct {
	Login    string // username or email
	Password string
}

// LoginGuard is the narrow interface user.Service needs to enforce login
// lockouts. Implementations are Redis-backed in production and a no-op in
// tests. Nil is allowed — when unset, lockout is disabled and the login
// path is fully open (legacy behaviour).
type LoginGuard interface {
	// IsLocked reports whether the given login identifier is currently
	// locked out. The second return is the remaining lockout duration in
	// seconds, so the handler can include it in the 423 response.
	IsLocked(login string) (bool, int)
	// RecordFailure bumps the failure counter for login. Returns the new
	// count and whether the guard just tripped into a locked state.
	RecordFailure(login string) (count int, nowLocked bool)
	// Reset clears the failure counter after a successful login.
	Reset(login string)
}

// ErrAccountLocked is returned when the login guard has tripped. Handlers
// should return HTTP 423 Locked (or 429 if you don't want to expose the
// account-exists signal) and include a retry-after hint.
var ErrAccountLocked = errors.New("account temporarily locked")

func (s *Service) SetLoginGuard(g LoginGuard) { s.loginGuard = g }

// LockoutSecondsRemaining exposes the per-login lockout TTL to handlers
// so they can surface it in the error response.
func (s *Service) LockoutSecondsRemaining(login string) int {
	if s.loginGuard == nil {
		return 0
	}
	_, secs := s.loginGuard.IsLocked(strings.TrimSpace(login))
	return secs
}

func (s *Service) Login(in LoginInput) (*User, error) {
	login := strings.TrimSpace(in.Login)
	// Fast-path lockout check before touching the DB. Saves a lookup when
	// an attacker is hammering the same login, and prevents bcrypt from
	// being used as an oracle.
	if s.loginGuard != nil {
		if locked, _ := s.loginGuard.IsLocked(login); locked {
			return nil, ErrAccountLocked
		}
	}
	u, err := s.repo.FindByLogin(login)
	if err != nil {
		return nil, err
	}
	if u == nil {
		// Intentionally record the failure so a username-probing attacker
		// is rate-limited the same way a password-guessing one is.
		if s.loginGuard != nil {
			s.loginGuard.RecordFailure(login)
		}
		return nil, ErrInvalidCredential
	}
	if u.Status != "active" {
		return nil, ErrAccountDisabled
	}
	if err := bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(in.Password)); err != nil {
		if s.loginGuard != nil {
			if _, nowLocked := s.loginGuard.RecordFailure(login); nowLocked {
				return nil, ErrAccountLocked
			}
		}
		return nil, ErrInvalidCredential
	}
	if s.loginGuard != nil {
		s.loginGuard.Reset(login)
	}
	return u, nil
}

func (s *Service) GetByID(id int64) (*User, error) {
	u, err := s.repo.FindByID(id)
	if err != nil {
		return nil, ErrUserNotFound
	}
	return u, nil
}

func (s *Service) List(opts ListOptions) ([]User, int64, error) {
	return s.repo.List(opts)
}

// Ban marks a user as banned. Their existing content is hidden by content
// services that respect the status field.
func (s *Service) Ban(id int64) (*User, error) {
	u, err := s.repo.FindByID(id)
	if err != nil || u == nil {
		return nil, ErrUserNotFound
	}
	if u.Role == "admin" {
		return nil, ErrAccountDisabled // refuse to ban admins via this path
	}
	if err := s.repo.UpdateStatus(id, "banned"); err != nil {
		return nil, err
	}
	u.Status = "banned"
	return u, nil
}

func (s *Service) Unban(id int64) (*User, error) {
	u, err := s.repo.FindByID(id)
	if err != nil || u == nil {
		return nil, ErrUserNotFound
	}
	if err := s.repo.UpdateStatus(id, "active"); err != nil {
		return nil, err
	}
	u.Status = "active"
	return u, nil
}

func (s *Service) GetByUsername(username string) (*User, error) {
	u, err := s.repo.FindByUsername(username)
	if err != nil {
		return nil, err
	}
	if u == nil {
		return nil, ErrUserNotFound
	}
	return u, nil
}
