package app

import (
	"log"

	"github.com/gin-gonic/gin"

	"github.com/redup/backend/config"
	"github.com/redup/backend/internal/announcement"
	"github.com/redup/backend/internal/anon"
	"github.com/redup/backend/internal/audit"
	"github.com/redup/backend/internal/bot"
	"github.com/redup/backend/internal/contentfilter"
	"github.com/redup/backend/internal/credits"
	"github.com/redup/backend/internal/db"
	"github.com/redup/backend/internal/follow"
	"github.com/redup/backend/internal/forum"
	"github.com/redup/backend/internal/llm"
	"github.com/redup/backend/internal/messaging"
	"github.com/redup/backend/internal/moderation"
	"github.com/redup/backend/internal/notification"
	"github.com/redup/backend/internal/platform/site"
	redisx "github.com/redup/backend/internal/redis"
	"github.com/redup/backend/internal/report"
	"github.com/redup/backend/internal/translation"
	"github.com/redup/backend/internal/upload"
	"github.com/redup/backend/internal/user"
)

// App is the composed server: the gin router, wired handlers, and the
// underlying services needed for graceful shutdown / health checks.
// cmd/server/main.go holds an *App and calls Router() to serve HTTP.
type App struct {
	svcs   *services
	router *gin.Engine
}

// New opens the database, runs migrations, builds every domain service,
// wires them together, and mounts routes onto a fresh gin.Engine. Returns
// a ready-to-serve App or the first fatal error encountered. Callers are
// expected to own gin mode setup (gin.SetMode) before calling this —
// New respects whatever the caller configured.
func New(cfg *config.Config) (*App, error) {
	database, err := db.Open(cfg.DatabaseURL)
	if err != nil {
		return nil, err
	}
	if err := database.AutoMigrate(
		&user.User{},
		&forum.Category{},
		&forum.Topic{},
		&forum.Post{},
		&forum.Like{},
		&forum.Bookmark{},
		&anon.IDMapping{},
		&anon.AuditLog{},
		&site.Setting{},
		&report.Report{},
		&audit.Log{},
		&notification.Notification{},
		&follow.Follow{},
		&bot.Bot{},
		&bot.CallLog{},
		&bot.APIToken{},
		&credits.Transaction{},
		&translation.CacheEntry{},
		&contentfilter.Word{},
		&moderation.Log{},
		&messaging.Conversation{},
		&messaging.Message{},
		&announcement.Announcement{},
		&upload.Attachment{},
		&llm.CallLog{},
	); err != nil {
		return nil, err
	}

	rdb := redisx.Open(cfg.RedisURL)
	log.Println("redis connected")

	svcs, err := buildServices(cfg, database, rdb)
	if err != nil {
		return nil, err
	}
	router := mountRoutes(svcs)
	return &App{svcs: svcs, router: router}, nil
}

// Router returns the wired gin.Engine. Callers mount it as the Handler
// of an *http.Server and manage the listen/shutdown cycle themselves.
func (a *App) Router() *gin.Engine { return a.router }
