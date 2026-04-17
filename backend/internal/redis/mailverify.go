package redis

import (
	"context"
	"errors"
	"log"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

// MailVerifyStore persists short-lived email verification codes. One key
// pair per email:
//
//   - mailverify:code:<email>        → stored 6-digit code, TTL 15min
//   - mailverify:cooldown:<email>    → sentinel set while resend is locked
//
// The cooldown key has a shorter TTL (default 60s) so users can't spam
// the SMTP server by hammering the resend button, but it expires on its
// own so a legitimate user doesn't get stuck.
type MailVerifyStore struct {
	rdb            *redis.Client
	codeTTL        time.Duration
	cooldownSecs   int
}

// NewMailVerifyStore returns a store with the given TTLs. Sensible
// defaults: 15 minutes for the code, 60 seconds between resends.
func NewMailVerifyStore(rdb *redis.Client, codeTTL time.Duration, cooldownSecs int) *MailVerifyStore {
	return &MailVerifyStore{rdb: rdb, codeTTL: codeTTL, cooldownSecs: cooldownSecs}
}

func (s *MailVerifyStore) codeKey(email string) string {
	return "mailverify:code:" + strings.ToLower(strings.TrimSpace(email))
}

func (s *MailVerifyStore) cooldownKey(email string) string {
	return "mailverify:cooldown:" + strings.ToLower(strings.TrimSpace(email))
}

// ErrResendTooSoon signals that the caller hit the cooldown window.
// Handlers translate this to a 429 with a retry-after seconds hint.
var ErrResendTooSoon = errors.New("resend too soon")

// CooldownSeconds returns the remaining cooldown for the given email,
// or 0 if no cooldown is active. Handlers use this to surface a
// retry-after hint in the error envelope.
func (s *MailVerifyStore) CooldownSeconds(email string) int {
	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()
	ttl, err := s.rdb.TTL(ctx, s.cooldownKey(email)).Result()
	if err != nil || ttl <= 0 {
		return 0
	}
	return int(ttl.Seconds())
}

// Put atomically sets the code and arms the cooldown. Returns
// ErrResendTooSoon when the cooldown hasn't elapsed; callers should
// decide whether to echo the error back verbatim or fall through to a
// best-effort "we sent a mail" response to avoid leaking timing.
func (s *MailVerifyStore) Put(email, code string) error {
	if s == nil || s.rdb == nil {
		return errors.New("mail verify store not configured")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancel()

	// Gate the resend: NX means we only set the cooldown if it's not
	// already present. A false "set" result means someone just asked
	// for a code within the cooldown window.
	ok, err := s.rdb.SetNX(ctx, s.cooldownKey(email), "1", time.Duration(s.cooldownSecs)*time.Second).Result()
	if err != nil {
		return err
	}
	if !ok {
		return ErrResendTooSoon
	}

	if err := s.rdb.Set(ctx, s.codeKey(email), code, s.codeTTL).Err(); err != nil {
		// Best-effort cleanup: if the code write fails, drop the
		// cooldown so the user isn't stuck waiting 60s for a retry.
		_ = s.rdb.Del(ctx, s.cooldownKey(email)).Err()
		return err
	}
	return nil
}

// Consume returns (ok, true) when code matches; on success the stored
// value is deleted so the same code can't be replayed. A miss returns
// (false, false). A Redis outage also returns (false, false) and logs
// — we fail closed because a missing code store mustn't let anyone
// verify an email with a guessed 6-digit number.
func (s *MailVerifyStore) Consume(email, code string) bool {
	if s == nil || s.rdb == nil {
		return false
	}
	ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancel()
	stored, err := s.rdb.Get(ctx, s.codeKey(email)).Result()
	if err != nil {
		if !errors.Is(err, redis.Nil) {
			log.Printf("[mailverify] redis get failed: %v", err)
		}
		return false
	}
	if stored != code {
		return false
	}
	// Delete the key so the code can't be re-used. Also drop cooldown
	// so any follow-up action (e.g. password reset flow reusing the
	// same address) isn't artificially blocked.
	_ = s.rdb.Del(ctx, s.codeKey(email), s.cooldownKey(email)).Err()
	return true
}
