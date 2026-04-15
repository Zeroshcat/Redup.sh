package redis

import (
	"context"
	"log"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

// LoginGuard enforces per-login failure lockouts using Redis as the
// counter store. Config is fixed at construction time so the same guard
// instance produces consistent behaviour across every handler that holds
// a reference.
//
// Windowing: every failure INCRs a per-login key with a short TTL
// (WindowSeconds). Once the counter exceeds MaxFailures, a sibling
// "locked" key is written with LockSeconds TTL and every subsequent
// check reads that. The two-key layout means we can clear the counter
// independently of the lock — resetting on success doesn't lift an
// existing lock, which is the right security stance.
type LoginGuard struct {
	rdb            *redis.Client
	MaxFailures    int
	WindowSeconds  int
	LockSeconds    int
}

// NewLoginGuard returns a guard that locks an identifier after
// maxFailures failures within windowSec, with lockSec lockout duration.
// Sensible defaults for a public forum: 5 failures per 10 minutes,
// 15-minute lockout.
func NewLoginGuard(rdb *redis.Client, maxFailures, windowSec, lockSec int) *LoginGuard {
	return &LoginGuard{
		rdb:           rdb,
		MaxFailures:   maxFailures,
		WindowSeconds: windowSec,
		LockSeconds:   lockSec,
	}
}

func (g *LoginGuard) loginKey(login string) string {
	// Normalize so "Alice" and "alice" share the same bucket. This is
	// critical — otherwise an attacker can bypass the limit by varying
	// case on every attempt.
	return "login:fail:" + strings.ToLower(login)
}

func (g *LoginGuard) lockKey(login string) string {
	return "login:lock:" + strings.ToLower(login)
}

func (g *LoginGuard) call(fn func(ctx context.Context) error) {
	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()
	if err := fn(ctx); err != nil {
		log.Printf("[login-guard] redis op failed: %v", err)
	}
}

// IsLocked implements user.LoginGuard.
func (g *LoginGuard) IsLocked(login string) (bool, int) {
	if g == nil || g.rdb == nil {
		return false, 0
	}
	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()
	ttl, err := g.rdb.TTL(ctx, g.lockKey(login)).Result()
	if err != nil {
		// Fail-open: a Redis outage shouldn't indefinitely lock anyone out.
		return false, 0
	}
	if ttl <= 0 {
		return false, 0
	}
	return true, int(ttl.Seconds())
}

// RecordFailure implements user.LoginGuard.
func (g *LoginGuard) RecordFailure(login string) (int, bool) {
	if g == nil || g.rdb == nil {
		return 0, false
	}
	var count int64
	var nowLocked bool
	g.call(func(ctx context.Context) error {
		n, err := g.rdb.Incr(ctx, g.loginKey(login)).Result()
		if err != nil {
			return err
		}
		count = n
		if n == 1 {
			g.rdb.Expire(ctx, g.loginKey(login), time.Duration(g.WindowSeconds)*time.Second)
		}
		if int(n) >= g.MaxFailures {
			// Trip the lock. Setting the key unconditionally refreshes the
			// lockout TTL on every subsequent failed attempt, which is the
			// common "keep pounding, keep locked out" behaviour users
			// expect from this kind of guard.
			g.rdb.Set(ctx, g.lockKey(login), "1", time.Duration(g.LockSeconds)*time.Second)
			nowLocked = true
		}
		return nil
	})
	return int(count), nowLocked
}

// Reset implements user.LoginGuard. Only clears the failure counter; any
// active lockout is left alone so a racing success can't lift an existing
// lock.
func (g *LoginGuard) Reset(login string) {
	if g == nil || g.rdb == nil {
		return
	}
	g.call(func(ctx context.Context) error {
		return g.rdb.Del(ctx, g.loginKey(login)).Err()
	})
}
