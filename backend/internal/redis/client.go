package redis

import (
	"context"
	"log"
	"time"

	"github.com/redis/go-redis/v9"
)

// Open parses a redis URL (redis://user:pass@host:port/db) and pings the
// server to fail fast on misconfiguration.
func Open(url string) *redis.Client {
	opt, err := redis.ParseURL(url)
	if err != nil {
		log.Fatalf("invalid redis url: %v", err)
	}
	client := redis.NewClient(opt)

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if err := client.Ping(ctx).Err(); err != nil {
		log.Fatalf("failed to connect redis: %v", err)
	}
	return client
}
