package user

import (
	"context"
	"errors"
	"log"
	"regexp"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

var (
	ErrUsernameTaken      = errors.New("username already taken")
	ErrEmailTaken         = errors.New("email already taken")
	ErrInvalidUsername    = errors.New("invalid username")
	ErrInvalidEmail       = errors.New("invalid email")
	ErrWeakPassword       = errors.New("password too weak")
	ErrInvalidCredential  = errors.New("invalid credentials")
	ErrUserNotFound       = errors.New("user not found")
	ErrAccountDisabled    = errors.New("account disabled")
	ErrRegistrationClosed = errors.New("registration is closed")
	ErrInviteRequired     = errors.New("invite code required")
	ErrInvalidInviteCode  = errors.New("invalid invite code")
	ErrEmailDomainBlocked = errors.New("email domain not allowed")
	ErrEmailNotVerified   = errors.New("email not verified")
)

// RegistrationConfig is the narrow read-only interface user.Service needs
// to enforce the live registration policy from site_settings.
type RegistrationConfig interface {
	RegistrationMode() string
	InviteRequired() bool
	EmailDomainRestricted() bool
	AllowedEmailDomains() []string
	EmailVerifyRequired() bool
}

// InviteValidator lets the user service check + consume invite codes
// without importing the invite package.
type InviteValidator interface {
	Validate(code string) error
	Consume(code string, userID int64, username string) error
}

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
	repo        *Repository
	credits     CreditsAwarder
	loginGuard  LoginGuard
	regConfig   RegistrationConfig
	invite      InviteValidator
	mailer      MailSender
	verifyCodes VerifyCodeStore
	resetStore  PasswordResetStore
	resetLinkFn func() string
	siteNameFn  func() string
}

func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

func (s *Service) SetCreditsAwarder(c CreditsAwarder) { s.credits = c }
func (s *Service) SetRegistrationConfig(c RegistrationConfig) { s.regConfig = c }
func (s *Service) SetInviteValidator(v InviteValidator) { s.invite = v }

type RegisterInput struct {
	Username   string
	Email      string
	Password   string
	InviteCode string
}

func (s *Service) Register(in RegisterInput) (*User, error) {
	in.Username = strings.TrimSpace(in.Username)
	in.Email = strings.ToLower(strings.TrimSpace(in.Email))

	// Enforce registration policy from site_settings.
	if s.regConfig != nil {
		mode := s.regConfig.RegistrationMode()
		switch mode {
		case "closed":
			return nil, ErrRegistrationClosed
		case "invite":
			if strings.TrimSpace(in.InviteCode) == "" {
				return nil, ErrInviteRequired
			}
		}
		if mode == "open" && s.regConfig.InviteRequired() {
			if strings.TrimSpace(in.InviteCode) == "" {
				return nil, ErrInviteRequired
			}
		}
		if s.regConfig.EmailDomainRestricted() {
			allowed := s.regConfig.AllowedEmailDomains()
			if len(allowed) > 0 {
				parts := strings.SplitN(in.Email, "@", 2)
				if len(parts) != 2 || !domainAllowed(parts[1], allowed) {
					return nil, ErrEmailDomainBlocked
				}
			}
		}
	}

	// Pre-validate invite code before heavy work (bcrypt etc).
	needsInvite := strings.TrimSpace(in.InviteCode) != ""
	if needsInvite && s.invite != nil {
		if err := s.invite.Validate(in.InviteCode); err != nil {
			return nil, ErrInvalidInviteCode
		}
	}

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

	// Consume the invite code AFTER user creation succeeds — if the code
	// has already been fully used between our Validate and now, the user
	// still gets created (acceptable: the invite was valid at the time
	// they submitted).
	if needsInvite && s.invite != nil {
		_ = s.invite.Consume(in.InviteCode, u.ID, u.Username)
	}

	if s.credits != nil {
		s.credits.Award(u.ID, "signup_bonus", "user", u.ID, "新用户注册礼包")
	}

	// Best-effort: send a verification mail when the site requires it and
	// mailer + code store are both wired. A failure here doesn't abort
	// registration — the user can resend later from the verify page.
	if s.regConfig != nil && s.regConfig.EmailVerifyRequired() && s.mailer != nil && s.verifyCodes != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cancel()
		if err := s.SendVerificationEmail(ctx, u.Email); err != nil {
			log.Printf("[register] send verification mail failed for %s: %v", u.Email, err)
		}
	}

	return u, nil
}

func domainAllowed(domain string, allowed []string) bool {
	domain = strings.ToLower(domain)
	for _, a := range allowed {
		if strings.ToLower(strings.TrimSpace(a)) == domain {
			return true
		}
	}
	return false
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
	// Email-verify gate: block login for unverified users only when the
	// site policy requires verification. Authoritative source is the
	// registration config passed in by main; we fall through silently
	// when it's absent (tests, early bootstrap).
	if s.VerifyRequiredAndMissing(u) {
		return u, ErrEmailNotVerified
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

// UpdateProfileInput carries the self-service editable fields. Whatever
// isn't supplied is trimmed/normalized in UpdateProfile; empty strings
// are allowed (they clear the field) but oversized input is rejected so
// the database columns never see truncation.
type UpdateProfileInput struct {
	AvatarURL string
	Bio       string
	Location  string
	Website   string
}

var ErrInvalidProfile = errors.New("invalid profile field")

func (s *Service) UpdateProfile(id int64, in UpdateProfileInput) (*User, error) {
	in.AvatarURL = strings.TrimSpace(in.AvatarURL)
	in.Bio = strings.TrimSpace(in.Bio)
	in.Location = strings.TrimSpace(in.Location)
	in.Website = strings.TrimSpace(in.Website)

	// Keep these in sync with the column sizes in user.model.go:
	// AvatarURL 512, Bio TEXT (cap at 500 runes as a sanity floor),
	// Location 64, Website 255. Length in runes, not bytes.
	if runes := []rune(in.AvatarURL); len(runes) > 512 {
		return nil, ErrInvalidProfile
	}
	if runes := []rune(in.Bio); len(runes) > 500 {
		return nil, ErrInvalidProfile
	}
	if runes := []rune(in.Location); len(runes) > 64 {
		return nil, ErrInvalidProfile
	}
	if runes := []rune(in.Website); len(runes) > 255 {
		return nil, ErrInvalidProfile
	}
	if in.Website != "" {
		// Minimally strict URL check so a hostile client can't land
		// javascript: or data: URIs on another user's profile.
		if !strings.HasPrefix(in.Website, "http://") && !strings.HasPrefix(in.Website, "https://") {
			return nil, ErrInvalidProfile
		}
	}

	if err := s.repo.UpdateProfile(id, in.AvatarURL, in.Bio, in.Location, in.Website); err != nil {
		return nil, err
	}
	return s.repo.FindByID(id)
}

// ChangePassword verifies the old password, validates the new one, and
// writes the new bcrypt hash. Returns ErrInvalidCredential when the old
// password is wrong (same code as login failure — don't leak whether
// the account exists) and ErrWeakPassword when the new value is too short.
func (s *Service) ChangePassword(id int64, oldPassword, newPassword string) error {
	u, err := s.repo.FindByID(id)
	if err != nil || u == nil {
		return ErrInvalidCredential
	}
	if err := bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(oldPassword)); err != nil {
		return ErrInvalidCredential
	}
	if len(newPassword) < 8 {
		return ErrWeakPassword
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	return s.repo.UpdatePasswordHash(id, string(hash))
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

// AdjustCreditScore applies a signed delta (positive restores, negative
// penalizes) to the user's credit_score, clamped to [0, 100]. Returns the
// user record and the new score. Used by admin moderation and report
// handling paths.
func (s *Service) AdjustCreditScore(id int64, delta int) (*User, int, error) {
	u, err := s.repo.FindByID(id)
	if err != nil || u == nil {
		return nil, 0, ErrUserNotFound
	}
	next, err := s.repo.AdjustCreditScore(id, delta)
	if err != nil {
		return nil, 0, err
	}
	u.CreditScore = next
	return u, next, nil
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
