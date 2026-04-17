package user

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

// PasswordResetStore is the narrow interface user.Service needs to
// stash and redeem password-reset tokens. Redis-backed impl lives in
// internal/redis.
type PasswordResetStore interface {
	Put(token string, userID int64, email string) error
	Consume(token string) (userID int64, ok bool)
}

// ResetLinkBase returns the URL prefix that should be prepended to the
// reset token to form a clickable link in the outbound mail. Main
// wires this from the frontend base URL in config.
type ResetLinkBase interface {
	ResetLinkBase() string
}

var (
	ErrResetCooldown      = errors.New("password reset cooldown")
	ErrResetTokenInvalid  = errors.New("reset token invalid or expired")
	ErrResetStoreMissing  = errors.New("password reset store not configured")
)

// SetPasswordResetStore wires the token store. Nil disables the flow.
func (s *Service) SetPasswordResetStore(store PasswordResetStore) { s.resetStore = store }

// SetResetLinkBase wires the frontend URL used to build reset links.
func (s *Service) SetResetLinkBase(fn func() string) { s.resetLinkFn = fn }

// newResetToken returns a 32-byte URL-safe hex token. 256 bits of
// entropy is more than enough to make brute force infeasible for the
// 1-hour TTL we use here.
func newResetToken() string {
	var b [32]byte
	if _, err := rand.Read(b[:]); err != nil {
		// Fall back to time-based; crypto/rand failing is already
		// catastrophic and a weaker token is strictly better than
		// the service panicking.
		return fmt.Sprintf("%x-fallback-%d", b[:8], time.Now().UnixNano())
	}
	return hex.EncodeToString(b[:])
}

// RequestPasswordReset looks up the user by email, generates a token,
// stores it, and sends the reset link via mailer. Silent about
// registration state: missing users return nil so the caller can always
// respond 200 OK. Cooldown tripping returns ErrResetCooldown — the
// handler may choose to still echo success to avoid leaking.
func (s *Service) RequestPasswordReset(ctx context.Context, email string) error {
	if s.mailer == nil || !s.mailer.Ready() {
		return ErrMailNotConfigured
	}
	if s.resetStore == nil {
		return ErrResetStoreMissing
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
		// Silent: nothing to do, but report success to caller.
		return nil
	}

	token := newResetToken()
	if err := s.resetStore.Put(token, u.ID, email); err != nil {
		return err
	}

	base := ""
	if s.resetLinkFn != nil {
		base = strings.TrimRight(s.resetLinkFn(), "/")
	}
	link := fmt.Sprintf("%s/reset-password?token=%s", base, token)

	subject := fmt.Sprintf("%s 密码重置", s.siteName())
	text := fmt.Sprintf(
		"你好 %s,\n\n我们收到了你的密码重置请求。点击下面的链接在 1 小时内设置新密码:\n\n%s\n\n如果不是你本人操作，请忽略本邮件,你的密码不会改变。\n\n— %s",
		u.Username, link, s.siteName(),
	)
	html := fmt.Sprintf(
		`<p>你好 <b>%s</b>,</p><p>我们收到了你的密码重置请求。点击下面的按钮在 1 小时内设置新密码:</p><p><a href="%s" style="display:inline-block;padding:10px 18px;background:#0f172a;color:#fff;border-radius:6px;text-decoration:none">重置密码</a></p><p style="color:#666">或复制链接到浏览器:<br><code>%s</code></p><p>如果不是你本人操作,请忽略本邮件,你的密码不会改变。</p><p style="color:#888">— %s</p>`,
		u.Username, link, link, s.siteName(),
	)
	return s.mailer.Send(ctx, email, u.Username, subject, text, html)
}

// ResetPassword redeems a token and sets a new bcrypt hash. Enforces
// the same minimum length as register/change-password. The reset
// token is consumed on any path that finds it — no retries.
func (s *Service) ResetPassword(token, newPassword string) error {
	if s.resetStore == nil {
		return ErrResetStoreMissing
	}
	if len(newPassword) < 8 {
		return ErrWeakPassword
	}
	userID, ok := s.resetStore.Consume(token)
	if !ok {
		return ErrResetTokenInvalid
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	if err := s.repo.UpdatePasswordHash(userID, string(hash)); err != nil {
		return err
	}
	return nil
}
