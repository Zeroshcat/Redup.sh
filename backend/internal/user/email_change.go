package user

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"
)

// Email-change flow:
//
//   1. User requests a change to new_email while logged in.
//      Backend validates uniqueness + format, generates a 6-digit
//      code, stashes it under the NEW email in the mailverify store,
//      and sends the code to the new address.
//   2. User submits {new_email, code} and the server atomically
//      verifies and swaps the column, stamping email_verified_at to
//      the current time (the user just proved ownership).
//
// Rate-limiting is inherited from the shared MailVerifyStore's
// per-email 60s cooldown — if two users are racing the same target
// address, only one code is valid at a time (and uniqueness catches
// the losing side at the confirm step).

// RequestEmailChange starts an email-change flow for the given user.
// Validates format + uniqueness before spending an SMTP hit; a
// collision with an existing account returns ErrEmailTaken so the
// handler can echo a specific code.
func (s *Service) RequestEmailChange(ctx context.Context, userID int64, newEmail string) error {
	if s.mailer == nil || !s.mailer.Ready() {
		return ErrMailNotConfigured
	}
	if s.verifyCodes == nil {
		return ErrVerifyCodeStoreMissing
	}
	newEmail = strings.ToLower(strings.TrimSpace(newEmail))
	if !emailRegex.MatchString(newEmail) {
		return ErrInvalidEmail
	}

	me, err := s.repo.FindByID(userID)
	if err != nil || me == nil {
		return ErrUserNotFound
	}
	if strings.EqualFold(me.Email, newEmail) {
		return ErrEmailAlreadyVerified
	}
	// Registration-policy domain check: if the admin has restricted
	// registrations to certain domains, apply the same rule to
	// email-change. Prevents an attacker with one whitelisted-domain
	// account from sliding into an email outside the allowlist.
	if s.regConfig != nil && s.regConfig.EmailDomainRestricted() {
		allowed := s.regConfig.AllowedEmailDomains()
		if len(allowed) > 0 {
			parts := strings.SplitN(newEmail, "@", 2)
			if len(parts) != 2 || !domainAllowed(parts[1], allowed) {
				return ErrEmailDomainBlocked
			}
		}
	}
	if existing, err := s.repo.FindByEmail(newEmail); err != nil {
		return err
	} else if existing != nil {
		return ErrEmailTaken
	}

	code := newCode()
	if err := s.verifyCodes.Put(newEmail, code); err != nil {
		return err
	}

	subject := fmt.Sprintf("%s 邮箱变更验证码", s.siteName())
	text := fmt.Sprintf(
		"你好 %s,\n\n你在 %s 请求将账号邮箱变更为这个地址。请在 15 分钟内输入下面的验证码完成变更:\n\n    %s\n\n如果不是你本人操作，请忽略本邮件。\n\n— %s",
		me.Username, s.siteName(), code, s.siteName(),
	)
	html := fmt.Sprintf(
		`<p>你好 <b>%s</b>,</p><p>你在 %s 请求将账号邮箱变更为这个地址。请在 15 分钟内输入下面的验证码完成变更:</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px">%s</p><p>如果不是你本人操作，请忽略本邮件。</p><p style="color:#888">— %s</p>`,
		me.Username, s.siteName(), code, s.siteName(),
	)
	return s.mailer.Send(ctx, newEmail, me.Username, subject, text, html)
}

// ConfirmEmailChange consumes the code and swaps the email column.
// Returns the refreshed user so the caller can push it into its
// auth store without a second round-trip.
func (s *Service) ConfirmEmailChange(userID int64, newEmail, code string) (*User, error) {
	if s.verifyCodes == nil {
		return nil, ErrVerifyCodeStoreMissing
	}
	newEmail = strings.ToLower(strings.TrimSpace(newEmail))
	code = strings.TrimSpace(code)
	if newEmail == "" || code == "" {
		return nil, ErrInvalidCode
	}
	me, err := s.repo.FindByID(userID)
	if err != nil || me == nil {
		return nil, ErrUserNotFound
	}
	// Re-check uniqueness — someone else may have grabbed the address
	// between request and confirm. Rare in practice but we want a
	// clean error rather than a DB uniqueness violation surfacing.
	if existing, err := s.repo.FindByEmail(newEmail); err != nil {
		return nil, err
	} else if existing != nil && existing.ID != me.ID {
		return nil, ErrEmailTaken
	}
	if !s.verifyCodes.Consume(newEmail, code) {
		return nil, ErrInvalidCode
	}
	now := time.Now().UTC()
	if err := s.repo.UpdateEmail(userID, newEmail, now); err != nil {
		// Race on the unique index: treat as taken.
		if isUniqueViolation(err) {
			return nil, ErrEmailTaken
		}
		return nil, err
	}
	me.Email = newEmail
	me.EmailVerifiedAt = &now
	return me, nil
}

// isUniqueViolation is a best-effort check against Postgres' error
// signalling. We match the string "duplicate key" rather than importing
// pgx errcode constants because gorm wraps the driver error and the
// existing codebase doesn't have a centralized classifier yet.
func isUniqueViolation(err error) bool {
	if err == nil {
		return false
	}
	var msg string
	msg = err.Error()
	return strings.Contains(msg, "duplicate key") || strings.Contains(msg, "23505")
}

// ErrEmailChangeUnchanged is returned when the caller tries to change
// to the same email they already have. Reusing ErrEmailAlreadyVerified
// keeps the error surface small — see the sentinel in email_verify.go.
var _ = errors.New // keep the errors import stable for future expansion
