package http

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
)

// userIDContextKey is duplicated from auth.ContextKeyUserID so this file
// can read the authenticated user id without importing the auth package
// (auth already imports httpx, which would create an import cycle). Keep
// this constant in sync with auth.ContextKeyUserID — it's a narrow slice
// of the auth surface and changes to the key name should update both.
const userIDContextKey = "user_id"

// RateLimiter is the Redis-backed throttle used across authed and public
// endpoints. Counters are fixed-window by design: a per-bucket key gets
// INCR'd on each request and EXPIRE'd on first write. Fixed windows aren't
// perfectly smooth across boundaries but they're dead-simple, dirt cheap
// (two commands per request), and survive a cluster restart without
// silently losing protection.
type RateLimiter struct {
	rdb *redis.Client
}

func NewRateLimiter(rdb *redis.Client) *RateLimiter {
	return &RateLimiter{rdb: rdb}
}

// KeyFunc derives the throttle key for a request. Returning an empty
// string bypasses the limit (e.g. unauthenticated call to a user-keyed
// limiter — fall through and let a different layer handle it).
type KeyFunc func(c *gin.Context) string

// KeyByIP keys on the request's client IP, suitable for
// pre-authentication endpoints like login and register.
func KeyByIP(c *gin.Context) string {
	return "ip:" + c.ClientIP()
}

// OnlyWrites wraps a KeyFunc so the underlying limiter only engages for
// state-changing HTTP methods. Read traffic (GET/HEAD/OPTIONS) flows
// through untouched. Use this when you want to throttle mutations on a
// group that also serves a lot of reads (notifications, wallet, etc.)
// without starving polling clients.
func OnlyWrites(keyFn KeyFunc) KeyFunc {
	return func(c *gin.Context) string {
		m := c.Request.Method
		if m == "GET" || m == "HEAD" || m == "OPTIONS" {
			return ""
		}
		return keyFn(c)
	}
}

// KeyByUser keys on the authenticated user id. Returns "" if the caller
// is anonymous — the middleware lets those requests through untouched, on
// the assumption that an anonymous-key layer (KeyByIP) is also in play.
func KeyByUser(c *gin.Context) string {
	v, ok := c.Get(userIDContextKey)
	if !ok {
		return ""
	}
	uid, ok := v.(int64)
	if !ok || uid == 0 {
		return ""
	}
	return fmt.Sprintf("user:%d", uid)
}

// Middleware returns a Gin handler that limits `limit` requests per
// `window` for the given bucket, keyed by keyFn. When the limit is hit
// the middleware responds 429 and aborts the chain.
func (rl *RateLimiter) Middleware(bucket string, limit int, window time.Duration, keyFn KeyFunc) gin.HandlerFunc {
	return func(c *gin.Context) {
		if rl == nil || rl.rdb == nil {
			c.Next()
			return
		}
		k := keyFn(c)
		if k == "" {
			c.Next()
			return
		}
		redisKey := "rl:" + bucket + ":" + k
		ctx, cancel := context.WithTimeout(c.Request.Context(), 200*time.Millisecond)
		defer cancel()
		n, err := rl.rdb.Incr(ctx, redisKey).Result()
		if err != nil {
			// Fail-open: redis outage shouldn't take down the forum. Log and
			// let the request through.
			log.Printf("[ratelimit] redis incr failed bucket=%s err=%v", bucket, err)
			c.Next()
			return
		}
		if n == 1 {
			// Only set expiry on the first hit of the window, otherwise a
			// chatty client would refresh the TTL on every call and never
			// exit the bucket.
			rl.rdb.Expire(ctx, redisKey, window)
		}
		if n > int64(limit) {
			TooManyRequests(c, "rate limit exceeded")
			return
		}
		c.Next()
	}
}
