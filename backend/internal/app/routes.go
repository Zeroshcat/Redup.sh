package app

import (
	nethttp "net/http"
	"time"

	"github.com/getsentry/sentry-go"
	sentrygin "github.com/getsentry/sentry-go/gin"
	"github.com/gin-gonic/gin"

	"github.com/redup/backend/internal/auth"
	httpx "github.com/redup/backend/internal/http"
	"github.com/redup/backend/internal/platform/dashboard"
	"github.com/redup/backend/internal/platform/rbac"
	"github.com/redup/backend/internal/skills"
)

// mountRoutes builds a fresh gin.Engine from the supplied services bag.
// Middleware order matches the pre-refactor main.go exactly:
//
//	Recovery → Sentry → RequestID → Logger → Metrics → CORS →
//	BodyLimit → OptionalAuth → rate limiters → routes.
//
// Don't reorder without checking each middleware's preconditions; e.g.
// the rate limiter reads user_id from the context, which OptionalAuth
// must have set first.
func mountRoutes(s *services) *gin.Engine {
	r := gin.New()
	r.Use(gin.Recovery())
	if s.cfg.SentryDSN != "" && sentry.CurrentHub().Client() != nil {
		r.Use(sentrygin.New(sentrygin.Options{Repanic: true}))
	}
	r.Use(httpx.RequestID())
	r.Use(httpx.Logger())
	r.Use(httpx.Metrics())
	r.Use(httpx.CORS(s.cfg.CORSAllowOrigin))

	// Operational endpoints — mounted before BodyLimit + auth so scrapers
	// and LBs can reach them without a real origin or credentials.
	r.GET("/healthz", func(c *gin.Context) {
		c.JSON(nethttp.StatusOK, gin.H{"ok": true})
	})
	r.GET("/readyz", func(c *gin.Context) {
		sqlDB, err := s.db.DB()
		if err == nil {
			err = sqlDB.PingContext(c.Request.Context())
		}
		if err != nil {
			c.JSON(nethttp.StatusServiceUnavailable, gin.H{"ok": false, "err": "db"})
			return
		}
		if err := s.rdb.Ping(c.Request.Context()).Err(); err != nil {
			c.JSON(nethttp.StatusServiceUnavailable, gin.H{"ok": false, "err": "redis"})
			return
		}
		c.JSON(nethttp.StatusOK, gin.H{"ok": true})
	})
	r.GET("/metrics", httpx.MetricsHandler())

	// 1 MiB global body cap. SSE streams don't pass through a bound body
	// so this is safe on the root router; upload routes should scope their
	// own larger per-route limit.
	r.Use(httpx.BodyLimit(httpx.DefaultBodyLimit))

	// OptionalAuth populates user_id/user_role from Authorization if
	// present. Must run before the rate limiter middleware so the
	// authenticated bucket has a key to key on.
	r.Use(auth.OptionalAuth(s.jwtMgr))

	// Authed write cap — 60/min per user id. OnlyWrites skips reads so
	// polling clients aren't throttled.
	r.Use(s.rateLimiter.Middleware("user-write", 60, time.Minute, httpx.OnlyWrites(httpx.KeyByUser)))
	// Anonymous write cap — 30/min per IP. Only engages when no user_id
	// is on the context (i.e. the authed bucket above didn't fire).
	r.Use(s.rateLimiter.Middleware("ip-write", 30, time.Minute, httpx.OnlyWrites(func(c *gin.Context) string {
		if _, ok := c.Get("user_id"); ok {
			return ""
		}
		return httpx.KeyByIP(c)
	})))

	r.GET("/api/health", func(c *gin.Context) {
		httpx.OK(c, gin.H{"status": "ok"})
	})

	mountPublicAPI(r, s)
	mountAuthedAPI(r, s)
	mountAdminAPI(r, s)

	return r
}

// mountPublicAPI attaches the `/api` group: reads that optionally upgrade
// to authenticated calls (so hydrated UI state like user_liked flows
// through the same endpoint), plus the login/register flow guarded by an
// IP-keyed rate limiter.
func mountPublicAPI(r *gin.Engine, s *services) {
	api := r.Group("/api")

	// Dedicated IP bucket for auth endpoints — 20/min is enough for real
	// mistype retries and cheap enough for a short burst.
	authRateLimit := s.rateLimiter.Middleware("auth", 20, time.Minute, httpx.KeyByIP)
	s.userHandler.Register(api, authRateLimit)
	s.forumHandler.Register(api)
	s.siteHandler.RegisterPublic(api)
	s.followHandler.Register(api)
	s.botHandler.Register(api)
	s.streamHandler.Register(api)
	s.announcementHandler.RegisterPublic(api)

	// Bot reverse-call surface — authenticated by the bot's own API
	// token, not a user JWT. Own middleware, own group.
	skillGroup := api.Group("/skills")
	skillGroup.Use(skills.RequireBotToken(s.botSvc))
	s.skillHandler.Register(skillGroup)
}

// mountAuthedAPI attaches routes that require a valid user JWT but no
// admin role. Write-rate limiting is inherited from the root router.
func mountAuthedAPI(r *gin.Engine, s *services) {
	api := r.Group("/api")
	authed := api.Group("")
	authed.Use(auth.RequireAuth(s.jwtMgr))
	s.reportHandler.RegisterUser(authed)
	s.notifHandler.Register(authed)
	s.creditsHandler.Register(authed)
	s.translationHandler.Register(authed)
	s.messagingHandler.Register(authed)
}

// mountAdminAPI attaches the `/api/admin` group, which requires a valid
// JWT AND the admin role. Individual handlers may still narrow via
// RequirePermission. Audit recorders are already wired inside
// buildServices so admin actions leave a trail as soon as they land.
func mountAdminAPI(r *gin.Engine, s *services) {
	admin := r.Group("/api/admin")
	admin.Use(auth.RequireAuth(s.jwtMgr))
	admin.Use(rbac.RequireRole(rbac.RoleAdmin))

	admin.GET("/ping", func(c *gin.Context) {
		httpx.OK(c, gin.H{"ok": true, "role": rbac.RoleFromContext(c)})
	})
	admin.GET("/permissions", func(c *gin.Context) {
		httpx.OK(c, rbac.AllPermissions())
	})
	admin.GET("/roles/:role/permissions", func(c *gin.Context) {
		httpx.OK(c, rbac.PermissionsForRole(c.Param("role")))
	})

	s.siteHandler.RegisterAdmin(admin)
	s.forumHandler.RegisterAdmin(admin)
	s.reportHandler.RegisterAdmin(admin)
	s.userHandler.RegisterAdmin(admin)
	s.auditHandler.RegisterAdmin(admin)
	s.botHandler.RegisterAdmin(admin)
	s.cfHandler.RegisterAdmin(admin)
	s.moderationHandler.RegisterAdmin(admin)
	s.anonAdminHandler.RegisterAdmin(admin)

	// Dashboard is composite — reads across user / forum / bot / report /
	// audit, so it's built here rather than in buildServices.
	dashboardHandler := dashboard.NewHandler(s.userSvc, s.forumSvc, s.botSvc, s.reportSvc, s.auditSvc)
	dashboardHandler.RegisterAdmin(admin)

	s.announcementHandler.RegisterAdmin(admin)
	s.inviteHandler.RegisterAdmin(admin)
	s.creditsHandler.RegisterAdmin(admin)
	s.notifHandler.RegisterAdmin(admin)
	s.messagingHandler.RegisterAdmin(admin)
	s.llmHandler.RegisterAdmin(admin)
}
