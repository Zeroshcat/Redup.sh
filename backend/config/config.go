package config

import (
	"errors"
	"log"
	"os"
	"strconv"

	"github.com/joho/godotenv"
)

type Config struct {
	Port             string
	GinMode          string
	DatabaseURL      string
	RedisURL         string
	JWTAccessSecret  string
	JWTRefreshSecret string
	JWTAccessTTLMin  int
	JWTRefreshTTLDay int
	CORSAllowOrigin  string
	FrontendURL      string
	AnonIDPrefix     string
	SnowflakeNodeID  int

	BotEnabled    bool
	BotTimeoutSec int
	BotMaxContext int

	SentryDSN         string
	SentryEnvironment string

	// LinkPreviewAllowCIDRs is a comma-separated list of extra CIDR
	// ranges the link-preview SSRF guard should treat as "ok to
	// dial". Intended for dev setups behind transparent proxies
	// (e.g. Clash/Surge TUN mode, which returns fake IPs in
	// 198.18.0.0/15). Leave empty in production.
	LinkPreviewAllowCIDRs string
}

func Load() *Config {
	// Best-effort .env load — don't fail if missing (e.g. prod uses real env).
	if err := godotenv.Load(); err != nil {
		log.Println("no .env file found, using process env")
	}

	return &Config{
		Port:             envStr("PORT", "8080"),
		GinMode:          envStr("GIN_MODE", "debug"),
		DatabaseURL:      envStr("DATABASE_URL", "postgres://redup:redup@localhost:5432/redup?sslmode=disable"),
		RedisURL:         envStr("REDIS_URL", "redis://localhost:6379/0"),
		JWTAccessSecret:  envStr("JWT_ACCESS_SECRET", "dev-access-secret"),
		JWTRefreshSecret: envStr("JWT_REFRESH_SECRET", "dev-refresh-secret"),
		JWTAccessTTLMin:  envInt("JWT_ACCESS_TTL_MIN", 15),
		JWTRefreshTTLDay: envInt("JWT_REFRESH_TTL_DAYS", 7),
		CORSAllowOrigin:  envStr("CORS_ALLOW_ORIGIN", "http://localhost:3000"),
		FrontendURL:      envStr("FRONTEND_URL", envStr("CORS_ALLOW_ORIGIN", "http://localhost:3000")),
		AnonIDPrefix:     envStr("ANON_ID_PREFIX", "Anon"),
		SnowflakeNodeID:  envInt("SNOWFLAKE_NODE_ID", 1),

		BotEnabled:    envBool("BOT_ENABLED", false),
		BotTimeoutSec: envInt("BOT_TIMEOUT_SEC", 15),
		BotMaxContext: envInt("BOT_MAX_CONTEXT", 20),

		// NOTE: LLM provider credentials (OpenAI, Anthropic, DeepSeek, …)
		// live in site_settings.llm and are managed exclusively from
		// /admin/site → LLM 提供方. There are intentionally no env vars
		// for them anymore — one source of truth, editable without a
		// redeploy.

		SentryDSN:         envStr("SENTRY_DSN", ""),
		SentryEnvironment: envStr("SENTRY_ENVIRONMENT", "development"),

		LinkPreviewAllowCIDRs: envStr("LINKPREVIEW_ALLOW_CIDRS", ""),
	}
}

// Validate checks that production-critical settings are properly
// configured. Returns an error when GinMode is "release" but secrets are
// still at their default development values.
func (c *Config) Validate() error {
	if c.GinMode == "release" {
		if c.JWTAccessSecret == "dev-access-secret" {
			return errors.New("JWT_ACCESS_SECRET must be changed from default in release mode")
		}
		if c.JWTRefreshSecret == "dev-refresh-secret" {
			return errors.New("JWT_REFRESH_SECRET must be changed from default in release mode")
		}
	}
	return nil
}

func envBool(key string, fallback bool) bool {
	if v := os.Getenv(key); v != "" {
		switch v {
		case "1", "true", "yes", "on":
			return true
		case "0", "false", "no", "off":
			return false
		}
	}
	return fallback
}

func envStr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func envInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}
