package db

import (
	"fmt"
	"time"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// Pool tuning defaults. Postgres's default max_connections is 100, so
// capping Go-side at 25 leaves headroom for psql sessions, migrations,
// and any sidecar worker that runs alongside the API. Idle cap is the
// common "keep 25 warm, reap above that" pattern. Lifetime is bounded
// to one hour so dead connections after a PG restart or network
// migration get cycled without a service restart.
const (
	defaultMaxOpenConns    = 25
	defaultMaxIdleConns    = 25
	defaultConnMaxLifetime = time.Hour
	defaultConnMaxIdle     = 30 * time.Minute
)

func Open(dsn string) (*gorm.DB, error) {
	database, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn),
	})
	if err != nil {
		return nil, fmt.Errorf("failed to connect database: %w", err)
	}
	sqlDB, err := database.DB()
	if err != nil {
		return nil, fmt.Errorf("failed to get sql.DB handle: %w", err)
	}
	sqlDB.SetMaxOpenConns(defaultMaxOpenConns)
	sqlDB.SetMaxIdleConns(defaultMaxIdleConns)
	sqlDB.SetConnMaxLifetime(defaultConnMaxLifetime)
	sqlDB.SetConnMaxIdleTime(defaultConnMaxIdle)
	return database, nil
}
