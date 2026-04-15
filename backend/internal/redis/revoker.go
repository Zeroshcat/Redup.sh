package redis

import (
	"context"
	"log"
	"time"

	"github.com/redis/go-redis/v9"
)

// Revoker is the Redis-backed JTI blocklist used by auth.JWTManager to
// refuse logged-out tokens. Keys are "revoke:<jti>" with a TTL equal to
// the token's remaining lifetime at logout time — expired entries drop
// out naturally without any cleanup job.
type Revoker struct {
	rdb *redis.Client
}

func NewRevoker(rdb *redis.Client) *Revoker {
	return &Revoker{rdb: rdb}
}

// IsRevoked implements auth.Revoker. Fails open: a Redis error means we
// let the token through, on the assumption that a partial outage must
// not lock the entire user base out.
func (r *Revoker) IsRevoked(jti string) bool {
	if r == nil || r.rdb == nil || jti == "" {
		return false
	}
	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()
	n, err := r.rdb.Exists(ctx, "revoke:"+jti).Result()
	if err != nil {
		log.Printf("[revoker] redis exists failed: %v", err)
		return false
	}
	return n > 0
}

// Revoke implements auth.Revoker.
func (r *Revoker) Revoke(jti string, ttl time.Duration) {
	if r == nil || r.rdb == nil || jti == "" || ttl <= 0 {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()
	if err := r.rdb.Set(ctx, "revoke:"+jti, "1", ttl).Err(); err != nil {
		log.Printf("[revoker] redis set failed: %v", err)
	}
}
