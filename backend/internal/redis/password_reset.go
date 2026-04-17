package redis

import (
	"context"
	"errors"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"
)

// PasswordResetStore persists short-lived password-reset tokens. One
// key per token: reset:pw:<token> → user id, TTL 1h by default. A
// cooldown sentinel keyed by email throttles how often /forgot can
// be triggered for the same address.
type PasswordResetStore struct {
	rdb          *redis.Client
	tokenTTL     time.Duration
	cooldownSecs int
}

// NewPasswordResetStore returns a store with the given TTLs. 1-hour
// tokens and 60-second cooldown are the defaults passed by main.
func NewPasswordResetStore(rdb *redis.Client, tokenTTL time.Duration, cooldownSecs int) *PasswordResetStore {
	return &PasswordResetStore{rdb: rdb, tokenTTL: tokenTTL, cooldownSecs: cooldownSecs}
}

var ErrResetCooldown = errors.New("reset cooldown active")

func (s *PasswordResetStore) tokenKey(token string) string {
	return "reset:pw:" + token
}

func (s *PasswordResetStore) cooldownKey(email string) string {
	return "reset:pw:cooldown:" + email
}

// CheckCooldown returns (allowed, retryAfterSec). When allowed is
// false the handler should respond 200 OK anyway to avoid leaking the
// cooldown signal, but may optionally include the remaining seconds
// so an admin UI can show a countdown.
func (s *PasswordResetStore) CheckCooldown(email string) (bool, int) {
	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()
	ttl, err := s.rdb.TTL(ctx, s.cooldownKey(email)).Result()
	if err != nil || ttl <= 0 {
		return true, 0
	}
	return false, int(ttl.Seconds())
}

// Put records the token → user id mapping and arms the cooldown.
// Returns ErrResetCooldown when the cooldown hasn't elapsed.
func (s *PasswordResetStore) Put(token string, userID int64, email string) error {
	if s == nil || s.rdb == nil {
		return errors.New("password reset store not configured")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancel()

	ok, err := s.rdb.SetNX(ctx, s.cooldownKey(email), "1", time.Duration(s.cooldownSecs)*time.Second).Result()
	if err != nil {
		return err
	}
	if !ok {
		return ErrResetCooldown
	}

	if err := s.rdb.Set(ctx, s.tokenKey(token), strconv.FormatInt(userID, 10), s.tokenTTL).Err(); err != nil {
		_ = s.rdb.Del(ctx, s.cooldownKey(email)).Err()
		return err
	}
	return nil
}

// Consume atomically looks up and deletes the token so it can't be
// replayed. Returns (userID, true) on success; a missing or expired
// token returns (0, false).
func (s *PasswordResetStore) Consume(token string) (int64, bool) {
	if s == nil || s.rdb == nil {
		return 0, false
	}
	ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancel()
	val, err := s.rdb.GetDel(ctx, s.tokenKey(token)).Result()
	if err != nil {
		return 0, false
	}
	id, err := strconv.ParseInt(val, 10, 64)
	if err != nil {
		return 0, false
	}
	return id, true
}
