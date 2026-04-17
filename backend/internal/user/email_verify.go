package user

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"math/big"
	"strings"
	"time"
)

// MailSender is the narrow interface user.Service needs to deliver a
// verification email. Wired by main.go from the mailer package; a nil
// sender disables the whole flow, which is a valid state (admin just
// hasn't configured SMTP yet) — Service methods surface that as
// ErrMailNotConfigured so the handler can return a stable error.
type MailSender interface {
	Ready() bool
	Send(ctx context.Context, to, toName, subject, textBody, htmlBody string) error
}

// VerifyCodeStore is the narrow interface user.Service needs to stash
// and later redeem email verification codes. The Redis-backed
// implementation lives in internal/redis.
type VerifyCodeStore interface {
	Put(email, code string) error
	Consume(email, code string) bool
	CooldownSeconds(email string) int
}

// Sentinel errors surfaced by the email verification methods.
var (
	ErrMailNotConfigured      = errors.New("mail service not configured")
	ErrVerifyCodeStoreMissing = errors.New("verify code store not configured")
	ErrEmailAlreadyVerified   = errors.New("email already verified")
	ErrResendTooSoon          = errors.New("resend too soon")
	ErrInvalidCode            = errors.New("invalid or expired verification code")
)

// SetMailSender wires the outbound mail dependency. Nil is allowed.
func (s *Service) SetMailSender(m MailSender) { s.mailer = m }

// SetVerifyCodeStore wires the code store. Nil is allowed.
func (s *Service) SetVerifyCodeStore(st VerifyCodeStore) { s.verifyCodes = st }

// SetSiteNameFn lets main wire a function that returns the live site
// name. It's used as the email "from" name and in the subject line so
// the verification mail feels like it's from the platform, not "Redup".
func (s *Service) SetSiteNameFn(fn func() string) { s.siteNameFn = fn }

func (s *Service) siteName() string {
	if s.siteNameFn == nil {
		return "Redup"
	}
	if name := strings.TrimSpace(s.siteNameFn()); name != "" {
		return name
	}
	return "Redup"
}

// newCode returns a cryptographically-random 6-digit code. Using
// crypto/rand rather than math/rand means an attacker who can observe
// the process can't predict future codes.
func newCode() string {
	n, err := rand.Int(rand.Reader, big.NewInt(1_000_000))
	if err != nil {
		// Fall back to time-based if the kernel RNG is broken; extremely
		// unlikely but not worth panicking over a verification code.
		return fmt.Sprintf("%06d", time.Now().UnixNano()%1_000_000)
	}
	return fmt.Sprintf("%06d", n.Int64())
}

// SendVerificationEmail generates a fresh code, stores it, and ships
// it. Caller supplies the email — we look up the user to ensure it
// exists and isn't already verified. Resend cooldown is enforced by
// the store; a too-soon call returns ErrResendTooSoon without spending
// an SMTP hit.
func (s *Service) SendVerificationEmail(ctx context.Context, email string) error {
	if s.mailer == nil || !s.mailer.Ready() {
		return ErrMailNotConfigured
	}
	if s.verifyCodes == nil {
		return ErrVerifyCodeStoreMissing
	}
	email = strings.ToLower(strings.TrimSpace(email))
	if email == "" {
		return ErrInvalidEmail
	}

	u, err := s.repo.FindByEmail(email)
	if err != nil {
		return err
	}
	if u == nil {
		// Don't leak whether an email is registered — from the
		// caller's perspective we still return ok. The handler
		// translates this to a generic 200.
		return ErrUserNotFound
	}
	if u.EmailVerified() {
		return ErrEmailAlreadyVerified
	}

	code := newCode()
	if err := s.verifyCodes.Put(email, code); err != nil {
		return err
	}

	subject := fmt.Sprintf("%s 邮箱验证码", s.siteName())
	text := fmt.Sprintf(
		"你好 %s,\n\n你的邮箱验证码是:\n\n    %s\n\n该验证码 15 分钟内有效。如果不是你本人操作，请忽略本邮件。\n\n— %s",
		u.Username, code, s.siteName(),
	)
	html := fmt.Sprintf(
		`<p>你好 <b>%s</b>,</p><p>你的邮箱验证码是:</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px">%s</p><p>该验证码 15 分钟内有效。如果不是你本人操作，请忽略本邮件。</p><p style="color:#888">— %s</p>`,
		u.Username, code, s.siteName(),
	)
	return s.mailer.Send(ctx, email, u.Username, subject, text, html)
}

// VerifyEmailCode consumes a pending code. On success the user's
// email_verified_at is stamped. Returns ErrInvalidCode on a miss, which
// the handler maps to a 400 with code "invalid_verification_code".
func (s *Service) VerifyEmailCode(email, code string) (*User, error) {
	if s.verifyCodes == nil {
		return nil, ErrVerifyCodeStoreMissing
	}
	email = strings.ToLower(strings.TrimSpace(email))
	code = strings.TrimSpace(code)
	if email == "" || code == "" {
		return nil, ErrInvalidCode
	}
	u, err := s.repo.FindByEmail(email)
	if err != nil {
		return nil, err
	}
	if u == nil {
		return nil, ErrInvalidCode
	}
	if u.EmailVerified() {
		return u, nil
	}
	if !s.verifyCodes.Consume(email, code) {
		return nil, ErrInvalidCode
	}
	now := time.Now().UTC()
	if err := s.repo.MarkEmailVerified(u.ID, now); err != nil {
		return nil, err
	}
	u.EmailVerifiedAt = &now
	return u, nil
}

// VerifyRequiredAndMissing reports whether the user would be blocked
// from actions gated by email verification. The handler uses this
// alongside the registration config to decide whether to short-circuit
// login for unverified accounts.
func (s *Service) VerifyRequiredAndMissing(u *User) bool {
	if u == nil || s.regConfig == nil {
		return false
	}
	if v, ok := s.regConfig.(registrationEmailVerifyPolicy); ok {
		if !v.EmailVerifyRequired() {
			return false
		}
	}
	return !u.EmailVerified()
}

// registrationEmailVerifyPolicy is a narrow side-door on the
// RegistrationConfig interface. Keeps the main interface unchanged for
// existing callers while letting the email-verification code read the
// extra flag without a type assertion leak.
type registrationEmailVerifyPolicy interface {
	EmailVerifyRequired() bool
}
