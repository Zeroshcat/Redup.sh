package main

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	nethttp "net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/getsentry/sentry-go"
	sentrygin "github.com/getsentry/sentry-go/gin"
	"github.com/gin-gonic/gin"

	"github.com/redup/backend/config"
	"github.com/redup/backend/internal/announcement"
	"github.com/redup/backend/internal/anon"
	"github.com/redup/backend/internal/audit"
	"github.com/redup/backend/internal/auth"
	"github.com/redup/backend/internal/bot"
	"github.com/redup/backend/internal/contentfilter"
	"github.com/redup/backend/internal/credits"
	"github.com/redup/backend/internal/db"
	"github.com/redup/backend/internal/follow"
	"github.com/redup/backend/internal/forum"
	httpx "github.com/redup/backend/internal/http"
	"github.com/redup/backend/internal/llm"
	"github.com/redup/backend/internal/messaging"
	"github.com/redup/backend/internal/moderation"
	"github.com/redup/backend/internal/notification"
	"github.com/redup/backend/internal/platform/dashboard"
	"github.com/redup/backend/internal/platform/rbac"
	"github.com/redup/backend/internal/platform/site"
	"github.com/redup/backend/internal/report"
	"github.com/redup/backend/internal/skills"
	"github.com/redup/backend/internal/stream"
	"github.com/redup/backend/internal/translation"
	redisx "github.com/redup/backend/internal/redis"
	"github.com/redup/backend/internal/user"
)

func main() {
	cfg := config.Load()

	// Sentry is opt-in via SENTRY_DSN. Silent when unset so local dev
	// doesn't spew "sentry not configured" warnings on every boot.
	if cfg.SentryDSN != "" {
		if err := sentry.Init(sentry.ClientOptions{
			Dsn:              cfg.SentryDSN,
			Environment:      cfg.SentryEnvironment,
			AttachStacktrace: true,
			TracesSampleRate: 0.05,
		}); err != nil {
			log.Printf("sentry init failed: %v", err)
		} else {
			log.Printf("sentry enabled (env=%s)", cfg.SentryEnvironment)
			defer sentry.Flush(2 * time.Second)
		}
	}
	gin.SetMode(cfg.GinMode)

	database := db.Open(cfg.DatabaseURL)
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
		&llm.CallLog{},
	); err != nil {
		log.Fatalf("migration failed: %v", err)
	}

	rdb := redisx.Open(cfg.RedisURL)
	log.Println("redis connected")
	// Rate limiter and login guard are both redis-backed. Constructing
	// them here means the middleware can be attached to any route group
	// below without threading the client through every handler.
	rateLimiter := httpx.NewRateLimiter(rdb)
	loginGuard := redisx.NewLoginGuard(rdb, 5, 10*60, 15*60) // 5/10min → 15min lock

	jwtMgr := auth.NewJWTManager(
		cfg.JWTAccessSecret,
		cfg.JWTRefreshSecret,
		cfg.JWTAccessTTLMin,
		cfg.JWTRefreshTTLDay,
	)
	jwtMgr.SetRevoker(redisx.NewRevoker(rdb))

	userRepo := user.NewRepository(database)
	if promoted, err := userRepo.EnsureAdminExists(); err != nil {
		log.Fatalf("admin bootstrap failed: %v", err)
	} else if promoted {
		log.Println("no admin found — promoted earliest user to admin")
	}
	userSvc := user.NewService(userRepo)
	userSvc.SetLoginGuard(loginGuard)
	userHandler := user.NewHandler(userSvc, jwtMgr)

	anonRepo := anon.NewRepository(database)
	anonGen := anon.NewGenerator(int64(cfg.SnowflakeNodeID), cfg.AnonIDPrefix)
	anonSvc := anon.NewService(anonRepo, anonGen)
	log.Printf("anon id format: %s-<snowflake>", anonGen.Prefix())

	// Site settings. Seed defaults, then apply any persisted overrides to the
	// anon generator so the DB value wins over the env default.
	siteRepo := site.NewRepository(database)
	siteSvc := site.NewService(siteRepo)
	if err := siteSvc.SeedDefaults(); err != nil {
		log.Fatalf("site seed failed: %v", err)
	}
	if savedAnon, err := siteSvc.GetAnon(); err == nil && savedAnon.Prefix != "" {
		anonGen.SetPrefix(savedAnon.Prefix)
		log.Printf("anon prefix loaded from db: %s", savedAnon.Prefix)
	}
	siteSvc.OnAnonPrefixChange(func(p string) {
		anonGen.SetPrefix(p)
		log.Printf("anon prefix updated at runtime: %s", p)
	})
	siteHandler := site.NewHandler(siteSvc)

	// Credits / wallet system. Reads its rules live from site_settings via a
	// small adapter so admins can retune rewards without restarting.
	creditsRepo := credits.NewRepository(database)
	creditsSvc := credits.NewService(creditsRepo, &creditsConfigAdapter{siteSvc: siteSvc})
	creditsHandler := credits.NewHandler(creditsSvc)
	userSvc.SetCreditsAwarder(creditsSvc)
	userHandler.SetLevelComputer(creditsSvc)

	// Platform-level LLM service powers official features (translation,
	// moderation, summarization). User bots do NOT use this — they run their
	// own backend behind a webhook URL.
	llmRouter := llm.NewRouter()
	platformTimeout := time.Duration(cfg.BotTimeoutSec) * time.Second
	if cfg.OpenAIAPIKey != "" {
		llmRouter.Register("openai",
			llm.NewOpenAIClient(cfg.OpenAIAPIKey, cfg.OpenAIBaseURL, platformTimeout))
	}
	if cfg.AnthropicAPIKey != "" {
		llmRouter.Register("anthropic",
			llm.NewAnthropicClient(cfg.AnthropicAPIKey, cfg.AnthropicBaseURL, platformTimeout))
	}
	llmRepo := llm.NewRepository(database)
	llmRouter.SetObserver(&llmCallObserver{repo: llmRepo})
	llmSvc := llm.NewService(llmRouter)
	llmSvc.SetRepository(llmRepo)
	llmHandler := llm.NewHandler(llmSvc)
	log.Printf("platform llm providers: %v", llmRouter.Available())

	// Translation service uses the platform LLM router and charges through
	// the credits wallet. Cache table dedupes repeat translations.
	translationRepo := translation.NewRepository(database)
	translationSvc := translation.NewService(
		translationRepo,
		llmRouter,
		&translationWalletAdapter{creditsSvc: creditsSvc},
		&translationConfigAdapter{siteSvc: siteSvc},
	)
	translationHandler := translation.NewHandler(translationSvc)

	cfRepo := contentfilter.NewRepository(database)
	cfSvc := contentfilter.NewService(cfRepo)
	cfHandler := contentfilter.NewHandler(cfSvc)

	moderationRepo := moderation.NewRepository(database)
	moderationSvc := moderation.NewService(
		moderationRepo,
		llmRouter,
		&moderationConfigAdapter{siteSvc: siteSvc},
		&reportUserLookup{userSvc: userSvc},
	)
	moderationHandler := moderation.NewHandler(moderationSvc)

	auditRepo := audit.NewRepository(database)
	auditSvc := audit.NewService(auditRepo, &reportUserLookup{userSvc: userSvc})
	auditHandler := audit.NewHandler(auditSvc)

	streamHub := stream.NewHub()
	streamHandler := stream.NewHandler(streamHub, jwtMgr)

	notifRepo := notification.NewRepository(database)
	notifSvc := notification.NewService(notifRepo)
	notifSvc.SetPublisher(&notificationStreamAdapter{hub: streamHub})
	moderationSvc.SetPublisher(&moderationStreamAdapter{hub: streamHub})
	notifHandler := notification.NewHandler(notifSvc)

	messagingRepo := messaging.NewRepository(database)
	messagingSvc := messaging.NewService(messagingRepo, &followUserLookup{userSvc: userSvc})
	messagingSvc.SetNotifier(&messagingNotifyAdapter{notif: notifSvc})
	messagingSvc.SetPublisher(&messagingStreamAdapter{hub: streamHub})
	messagingHandler := messaging.NewHandler(messagingSvc)

	followRepo := follow.NewRepository(database)
	followSvc := follow.NewService(followRepo, &followUserLookup{userSvc: userSvc})
	followSvc.SetNotifier(&followNotifyAdapter{notif: notifSvc})
	followHandler := follow.NewHandler(followSvc, jwtMgr)

	botRepo := bot.NewRepository(database)
	botSvc := bot.NewService(botRepo, &reportUserLookup{userSvc: userSvc})
	botSvc.SetCallLogPublisher(&botCallLogStreamAdapter{hub: streamHub})
	botHandler := bot.NewHandler(botSvc, jwtMgr)

	// Bot trigger uses an HTTP webhook client — events go to each bot's own
	// backend, identified by the bot's stored webhook_url + api_key.
	botWebhook := bot.NewHTTPWebhookClient(time.Duration(cfg.BotTimeoutSec) * time.Second)
	if cfg.BotEnabled {
		log.Println("bot trigger enabled (webhook delivery mode)")
	}

	reportRepo := report.NewRepository(database)
	reportSvc := report.NewService(reportRepo)
	reportHandler := report.NewHandler(reportSvc, &reportUserLookup{userSvc: userSvc})

	forumRepo := forum.NewRepository(database)
	if err := forumRepo.SeedDefaultCategories(); err != nil {
		log.Fatalf("category seed failed: %v", err)
	}
	forumSvc := forum.NewService(forumRepo, anonSvc)
	forumSvc.SetNotifier(&forumNotifyAdapter{notif: notifSvc})
	forumSvc.SetCreditsAwarder(creditsSvc)
	forumSvc.SetContentFilter(&forumFilterAdapter{cfSvc: cfSvc})
	forumSvc.SetModerator(&forumModeratorAdapter{modSvc: moderationSvc})
	moderationSvc.SetReporter(&moderationReportAdapter{reportSvc: reportSvc})
	moderationSvc.SetBotPanel(&botModerationAdapter{botSvc: botSvc})
	reportSvc.SetNotifier(&reportNotifyAdapter{notif: notifSvc})
	reportSvc.SetPublisher(&reportStreamAdapter{hub: streamHub})

	// Wire bot ↔ forum bidirectional trigger.
	botSvc.SetTrigger(botWebhook, &botForumAdapter{forumSvc: forumSvc}, bot.TriggerConfig{
		Enabled:    cfg.BotEnabled,
		TimeoutSec: cfg.BotTimeoutSec,
		MaxContext: cfg.BotMaxContext,
	})
	forumSvc.SetBotTrigger(botSvc)

	forumHandler := forum.NewHandler(forumSvc, jwtMgr)

	r := gin.New()
	r.Use(gin.Recovery())
	// Sentry middleware captures panics and 5xxs into the configured DSN.
	// Must run early so downstream middleware errors are also reported.
	if cfg.SentryDSN != "" {
		r.Use(sentrygin.New(sentrygin.Options{Repanic: true}))
	}
	r.Use(httpx.RequestID())
	r.Use(httpx.Logger())
	r.Use(httpx.Metrics())
	r.Use(httpx.CORS(cfg.CORSAllowOrigin))

	// Operational endpoints. Mounted on the root router before CORS so
	// scrapers and load balancers can reach them without a real origin.
	// /healthz is a liveness probe that doesn't touch DB; /readyz pings
	// the DB and Redis so a rolling deploy can wait for cold caches.
	r.GET("/healthz", func(c *gin.Context) {
		c.JSON(nethttp.StatusOK, gin.H{"ok": true})
	})
	r.GET("/readyz", func(c *gin.Context) {
		// Check DB
		sqlDB, err := database.DB()
		if err == nil {
			err = sqlDB.PingContext(c.Request.Context())
		}
		if err != nil {
			c.JSON(nethttp.StatusServiceUnavailable, gin.H{"ok": false, "err": "db"})
			return
		}
		// Check Redis
		if err := rdb.Ping(c.Request.Context()).Err(); err != nil {
			c.JSON(nethttp.StatusServiceUnavailable, gin.H{"ok": false, "err": "redis"})
			return
		}
		c.JSON(nethttp.StatusOK, gin.H{"ok": true})
	})
	r.GET("/metrics", httpx.MetricsHandler())
	// Cap every request body at 1 MiB. SSE streams don't pass through a
	// bound body so this is safe for the root router. File upload routes
	// should mount a larger per-route limit.
	r.Use(httpx.BodyLimit(httpx.DefaultBodyLimit))
	// OptionalAuth runs first so the rate limiter below can read the
	// user id from context even for routes whose per-route auth
	// middleware is attached to a sub-group. It's a no-op when no
	// Authorization header is present.
	r.Use(auth.OptionalAuth(jwtMgr))
	// Global write-rate gate keyed by authenticated user id. OnlyWrites
	// skips reads so polling clients aren't throttled; unauthenticated
	// requests return an empty key from KeyByUser and fall through
	// (login/register get their own IP bucket mounted below).
	r.Use(rateLimiter.Middleware("user-write", 60, time.Minute, httpx.OnlyWrites(httpx.KeyByUser)))
	// Unauthenticated write fallback — keyed by IP so brand-new users
	// hitting /register or guests POSTing anywhere else can't flood.
	r.Use(rateLimiter.Middleware("ip-write", 30, time.Minute, httpx.OnlyWrites(func(c *gin.Context) string {
		// Only engage for anonymous callers; authed users are handled above.
		if _, ok := c.Get("user_id"); ok {
			return ""
		}
		return httpx.KeyByIP(c)
	})))

	r.GET("/api/health", func(c *gin.Context) {
		httpx.OK(c, gin.H{"status": "ok"})
	})

	announcementRepo := announcement.NewRepository(database)
	announcementSvc := announcement.NewService(announcementRepo)
	announcementHandler := announcement.NewHandler(announcementSvc)

	api := r.Group("/api")
	// Auth endpoints (/login, /register) are throttled by IP before they
	// ever see a handler. 20 attempts per minute is plenty for a real
	// user mistyping their password, and cheap enough for the server to
	// process a burst of them without falling over.
	authRateLimit := rateLimiter.Middleware("auth", 20, time.Minute, httpx.KeyByIP)
	userHandler.Register(api, authRateLimit)
	forumHandler.Register(api)
	siteHandler.RegisterPublic(api)
	followHandler.Register(api)
	botHandler.Register(api)
	streamHandler.Register(api)
	announcementHandler.RegisterPublic(api)

	// Bot reverse-call surface: authenticated by the bot's own API token, not
	// a user JWT. Mounted under /api/skills with its own middleware.
	skillHandler := skills.NewHandler(botSvc, forumSvc, auditSvc)
	skillGroup := api.Group("/skills")
	skillGroup.Use(skills.RequireBotToken(botSvc))
	skillHandler.Register(skillGroup)

	// Authenticated user-facing endpoints. Write-rate limiting is
	// applied globally at the router level so this group just needs auth.
	authed := api.Group("")
	authed.Use(auth.RequireAuth(jwtMgr))
	reportHandler.RegisterUser(authed)
	notifHandler.Register(authed)
	creditsHandler.Register(authed)
	translationHandler.Register(authed)
	messagingHandler.Register(authed)

	// Admin group: must be authenticated AND have the admin role.
	// Individual endpoints can still narrow with RequirePermission.
	admin := api.Group("/admin")
	admin.Use(auth.RequireAuth(jwtMgr))
	admin.Use(rbac.RequireRole(rbac.RoleAdmin))
	admin.GET("/ping", func(c *gin.Context) {
		httpx.OK(c, gin.H{
			"ok":   true,
			"role": rbac.RoleFromContext(c),
		})
	})
	admin.GET("/permissions", func(c *gin.Context) {
		httpx.OK(c, rbac.AllPermissions())
	})
	admin.GET("/roles/:role/permissions", func(c *gin.Context) {
		httpx.OK(c, rbac.PermissionsForRole(c.Param("role")))
	})
	// Wire audit recorder into every admin handler before mounting routes.
	forumHandler.SetAudit(auditSvc)
	userHandler.SetAudit(auditSvc)
	reportHandler.SetAudit(auditSvc)
	siteHandler.SetAudit(auditSvc)
	botHandler.SetAudit(auditSvc)
	cfHandler.SetAudit(auditSvc)
	announcementHandler.SetAudit(auditSvc)

	siteHandler.RegisterAdmin(admin)
	forumHandler.RegisterAdmin(admin)
	reportHandler.RegisterAdmin(admin)
	userHandler.RegisterAdmin(admin)
	auditHandler.RegisterAdmin(admin)
	botHandler.RegisterAdmin(admin)
	cfHandler.RegisterAdmin(admin)
	moderationHandler.RegisterAdmin(admin)
	anonAdminHandler := anon.NewHandler(anonSvc)
	anonAdminHandler.SetAuditRecorder(&anonAuditRecorder{svc: auditSvc})
	anonAdminHandler.RegisterAdmin(admin)
	dashboardHandler := dashboard.NewHandler(userSvc, forumSvc, botSvc, reportSvc, auditSvc)
	dashboardHandler.RegisterAdmin(admin)
	announcementHandler.RegisterAdmin(admin)
	creditsHandler.RegisterAdmin(admin)
	notifHandler.RegisterAdmin(admin)
	messagingHandler.RegisterAdmin(admin)
	llmHandler.RegisterAdmin(admin)

	srv := &nethttp.Server{
		Addr:              ":" + cfg.Port,
		Handler:           r,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      0, // SSE streams need an unbounded write
		IdleTimeout:       120 * time.Second,
	}
	go func() {
		log.Printf("Redup backend listening on :%s", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, nethttp.ErrServerClosed) {
			log.Fatal(err)
		}
	}()
	// Graceful shutdown: catch SIGINT/SIGTERM, let the load balancer
	// finish draining by refusing new connections and waiting up to 30s
	// for in-flight requests to complete. SSE connections are cut once
	// their client-side ctx.Done fires, which happens as soon as we
	// close the listener — no extra bookkeeping needed.
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("shutdown signal received, draining…")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("graceful shutdown failed: %v", err)
	}
	log.Println("server exited")
}

// reportUserLookup adapts user.Service to the report.UserLookup interface so
// the report module never has to import the user package directly.
type reportUserLookup struct {
	userSvc *user.Service
}

func (l *reportUserLookup) UsernameByID(id int64) (string, error) {
	if id == 0 {
		return "", nil
	}
	u, err := l.userSvc.GetByID(id)
	if err != nil || u == nil {
		return "", err
	}
	return u.Username, nil
}

// forumNotifyAdapter satisfies forum.Notifier and forwards into the
// notification service. Lives in main so the forum package never imports
// notification directly.
type forumNotifyAdapter struct {
	notif *notification.Service
}

func (a *forumNotifyAdapter) NotifyReply(
	recipientID, actorID int64,
	actorUsername string, actorIsAnon bool,
	targetType string, targetID int64,
	targetTitle, preview string,
) {
	a.notif.Notify(notification.Input{
		RecipientID:   recipientID,
		Type:          notification.TypeReply,
		ActorUserID:   actorID,
		ActorUsername: actorUsername,
		ActorIsAnon:   actorIsAnon,
		TargetType:    targetType,
		TargetID:      targetID,
		TargetTitle:   targetTitle,
		Text:          "回复了你",
		Preview:       preview,
	})
}

func (a *forumNotifyAdapter) NotifyLike(
	recipientID, actorID int64,
	actorUsername string,
	targetType string, targetID int64,
	targetTitle string,
) {
	text := "点赞了你的主题"
	if targetType == "post" {
		text = "点赞了你的回帖"
	}
	a.notif.Notify(notification.Input{
		RecipientID:   recipientID,
		Type:          notification.TypeLike,
		ActorUserID:   actorID,
		ActorUsername: actorUsername,
		TargetType:    targetType,
		TargetID:      targetID,
		TargetTitle:   targetTitle,
		Text:          text,
	})
}

func (a *forumNotifyAdapter) NotifyMention(
	recipientID, actorID int64,
	actorUsername string, actorIsAnon bool,
	targetType string, targetID int64,
	targetTitle, preview string,
) {
	a.notif.Notify(notification.Input{
		RecipientID:   recipientID,
		Type:          notification.TypeMention,
		ActorUserID:   actorID,
		ActorUsername: actorUsername,
		ActorIsAnon:   actorIsAnon,
		TargetType:    targetType,
		TargetID:      targetID,
		TargetTitle:   targetTitle,
		Text:          "在帖子里 @ 了你",
		Preview:       preview,
	})
}

// creditsConfigAdapter bridges the live site_settings credits group to the
// credits package's narrow ConfigSource interface.
type creditsConfigAdapter struct {
	siteSvc *site.Service
}

func (a *creditsConfigAdapter) GetCredits() (credits.Config, error) {
	c, err := a.siteSvc.GetCredits()
	if err != nil {
		return credits.Config{}, err
	}
	return credits.Config{
		SignupBonus:           credits.Reward{XP: c.SignupBonus.XP, Credits: c.SignupBonus.Credits},
		TopicReward:           credits.Reward{XP: c.TopicReward.XP, Credits: c.TopicReward.Credits},
		PostReward:            credits.Reward{XP: c.PostReward.XP, Credits: c.PostReward.Credits},
		LikeXPReward:          c.LikeXPReward,
		ViolationPenalty:      c.ViolationPenalty,
		DailyTopicCap:         c.DailyTopicCap,
		DailyPostCap:          c.DailyPostCap,
		DailyLikeXPCap:        c.DailyLikeXPCap,
		MinTopicLength:        c.MinTopicLength,
		MinPostLength:         c.MinPostLength,
		LevelThresholds:       c.LevelThresholds,
		DailyFreeTranslations: c.DailyFreeTranslations,
		TranslationCost:       c.TranslationCost,
		TranslationProvider:   c.TranslationProvider,
		TranslationModel:      c.TranslationModel,
	}, nil
}

// moderationConfigAdapter bridges site.Moderation + site.Rules to the
// moderation package's narrow ConfigSource interface.
type moderationConfigAdapter struct {
	siteSvc *site.Service
}

func (a *moderationConfigAdapter) GetModeration() (moderation.Config, error) {
	m, err := a.siteSvc.GetModeration()
	if err != nil {
		return moderation.Config{}, err
	}
	r, err := a.siteSvc.GetRules()
	if err != nil {
		return moderation.Config{}, err
	}
	return moderation.Config{
		Enabled:           m.Enabled,
		Provider:          m.Provider,
		Model:             m.Model,
		BlockAction:       m.BlockAction,
		Rules:             r.Content,
		AutoFlagThreshold: m.AutoFlagThreshold,
		SuggestRewrite:    m.SuggestRewrite,
	}, nil
}

// moderationReportAdapter bridges moderation.Reporter to report.Service so
// moderation can escalate repeat offenders without importing report.
type moderationReportAdapter struct {
	reportSvc *report.Service
}

func (a *moderationReportAdapter) CreateAutoReport(targetUserID int64, reason, note string) error {
	return a.reportSvc.SubmitSystem(targetUserID, reason, note)
}

// botModerationAdapter bridges moderation.BotPanel to bot.Service so the
// moderation pipeline can fan out to moderator bots without importing bot.
type botModerationAdapter struct {
	botSvc *bot.Service
}

func (a *botModerationAdapter) CheckAsModerators(ctx context.Context, content, categoryRules string) []moderation.BotVerdict {
	results := a.botSvc.CheckAsModerators(ctx, content, categoryRules)
	out := make([]moderation.BotVerdict, 0, len(results))
	for _, r := range results {
		out = append(out, moderation.BotVerdict{
			BotID:   r.BotID,
			BotSlug: r.BotSlug,
			BotName: r.BotName,
			Verdict: r.Verdict,
			Reason:  r.Reason,
		})
	}
	return out
}

// forumModeratorAdapter bridges moderation.Service to forum.Moderator. The
// 15s context timeout matches BOT_TIMEOUT_SEC and prevents an unresponsive
// model from hanging user-visible actions.
type forumModeratorAdapter struct {
	modSvc *moderation.Service
}

func (a *forumModeratorAdapter) Check(actorID int64, targetType, content, categoryRules string) forum.ModerationResult {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	r := a.modSvc.Check(ctx, actorID, targetType, content, categoryRules)
	return forum.ModerationResult{LogID: r.LogID, Verdict: r.Verdict, Reason: r.Reason, Blocked: r.Blocked}
}

func (a *forumModeratorAdapter) LinkTarget(logID, targetID int64) {
	a.modSvc.LinkTarget(logID, targetID)
}

func (a *forumModeratorAdapter) GenerateRewrite(content, reason, categoryRules string) string {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	return a.modSvc.GenerateRewrite(ctx, content, reason, categoryRules)
}

// forumFilterAdapter bridges contentfilter.Service to forum.ContentFilter so
// the forum package never imports contentfilter directly.
type forumFilterAdapter struct {
	cfSvc *contentfilter.Service
}

func (a *forumFilterAdapter) Check(text string) []forum.FilterHit {
	hits := a.cfSvc.Check(text)
	if len(hits) == 0 {
		return nil
	}
	out := make([]forum.FilterHit, 0, len(hits))
	for _, h := range hits {
		out = append(out, forum.FilterHit{Word: h.Word, Severity: h.Severity})
	}
	return out
}

// translationWalletAdapter satisfies translation.Wallet by mapping its narrow
// signature to credits.Service. Charge errors are translated so translation
// can match on its own sentinel without importing credits.
type translationWalletAdapter struct {
	creditsSvc *credits.Service
}

func (a *translationWalletAdapter) CountToday(userID int64, kind string) (int64, error) {
	return a.creditsSvc.CountToday(userID, kind)
}

func (a *translationWalletAdapter) Charge(userID int64, amount int, kind, refType string, refID int64, note string) error {
	if _, err := a.creditsSvc.Charge(userID, amount, kind, refType, refID, note); err != nil {
		if errors.Is(err, credits.ErrInsufficient) {
			return translation.ErrInsufficient
		}
		return err
	}
	return nil
}

func (a *translationWalletAdapter) RecordFreeUse(userID int64, refType string, refID int64, note string) error {
	return a.creditsSvc.RecordFreeUse(userID, translation.KindTranslation, refType, refID, note)
}

// translationConfigAdapter exposes the live site.Credits config to the
// translation package via the narrow ConfigSource interface.
type translationConfigAdapter struct {
	siteSvc *site.Service
}

func (a *translationConfigAdapter) GetTranslation() (translation.Config, error) {
	c, err := a.siteSvc.GetCredits()
	if err != nil {
		return translation.Config{}, err
	}
	return translation.Config{
		DailyFreeTranslations: c.DailyFreeTranslations,
		TranslationCost:       c.TranslationCost,
		Provider:              c.TranslationProvider,
		Model:                 c.TranslationModel,
	}, nil
}

// botForumAdapter satisfies bot.ForumContext by delegating to forum.Service.
// Lives in main so the bot package never imports forum.
type botForumAdapter struct {
	forumSvc *forum.Service
}

func (a *botForumAdapter) LoadTopicForBot(topicID int64) (bot.TopicSnapshot, error) {
	snap, err := a.forumSvc.LoadTopicForBot(topicID)
	if err != nil || snap == nil {
		return bot.TopicSnapshot{}, err
	}
	out := bot.TopicSnapshot{Title: snap.Title, Body: snap.Body}
	for _, p := range snap.Posts {
		out.Posts = append(out.Posts, bot.PostSnapshot{
			Floor:   p.Floor,
			Author:  p.Author,
			Content: p.Content,
			IsBot:   p.IsBot,
		})
	}
	return out, nil
}

func (a *botForumAdapter) PostBotReply(topicID, botID, ownerUserID int64, content string) error {
	return a.forumSvc.PostBotReply(topicID, botID, ownerUserID, content)
}

// followUserLookup adapts user.Service to follow.UserLookup.
type followUserLookup struct {
	userSvc *user.Service
}

func (l *followUserLookup) UsernameByID(id int64) (string, error) {
	if id == 0 {
		return "", nil
	}
	u, err := l.userSvc.GetByID(id)
	if err != nil || u == nil {
		return "", err
	}
	return u.Username, nil
}

func (l *followUserLookup) Exists(id int64) (bool, error) {
	if id == 0 {
		return false, nil
	}
	u, err := l.userSvc.GetByID(id)
	if err != nil {
		return false, nil
	}
	return u != nil, nil
}

// followNotifyAdapter satisfies follow.Notifier — pings the followed user.
type followNotifyAdapter struct {
	notif *notification.Service
}

func (a *followNotifyAdapter) NotifyFollow(recipientID, actorID int64, actorUsername string) {
	a.notif.Notify(notification.Input{
		RecipientID:   recipientID,
		Type:          notification.TypeFollow,
		ActorUserID:   actorID,
		ActorUsername: actorUsername,
		Text:          "关注了你",
	})
}

// notificationStreamAdapter satisfies notification.Publisher by marshalling
// the freshly-persisted Notification row to JSON and pushing it into the
// stream hub under event type "notification.new".
type notificationStreamAdapter struct {
	hub *stream.Hub
}

func (a *notificationStreamAdapter) PublishNotification(userID int64, n *notification.Notification) {
	data, err := json.Marshal(n)
	if err != nil {
		return
	}
	a.hub.Publish(userID, stream.Event{Type: "notification.new", Data: string(data)})
}

// anonAuditRecorder adapts audit.Service to anon.AuditRecorder, collapsing
// the generic audit.Input shape to the single (action, detail) pair the anon
// handler needs. Every deanonymization query flows through here so the audit
// log faithfully records who looked up whom.
type anonAuditRecorder struct {
	svc *audit.Service
}

func (a *anonAuditRecorder) Record(c *gin.Context, action, detail string) {
	a.svc.Record(c, audit.Input{
		Action:     action,
		TargetType: "anon",
		Detail:     detail,
	})
}

// llmCallObserver persists every llm.Router.Complete invocation for the
// admin panel. Writes are best-effort: a failed log write is noted but
// never propagates back into the caller, so an ops problem with the
// llm_call_logs table can't break translation or moderation.
type llmCallObserver struct {
	repo *llm.Repository
}

func (o *llmCallObserver) OnLLMCall(row llm.CallLog) {
	if o.repo == nil {
		return
	}
	if err := o.repo.Create(&row); err != nil {
		log.Printf("llm call log write failed: %v", err)
	}
}

// botCallLogStreamAdapter satisfies bot.CallLogPublisher by broadcasting
// failed webhook invocations to every connected admin. The service only
// calls this for error/timeout/blocked rows, so we don't need to re-filter
// here — every row that arrives is already actionable.
type botCallLogStreamAdapter struct {
	hub *stream.Hub
}

func (a *botCallLogStreamAdapter) PublishBotCallLog(row *bot.CallLog) {
	data, err := json.Marshal(row)
	if err != nil {
		return
	}
	a.hub.PublishToAdmins(stream.Event{Type: "bot.call.failed", Data: string(data)})
}

// reportStreamAdapter satisfies report.Publisher by broadcasting newly-filed
// and newly-handled reports to all connected admin clients. The event type
// distinguishes the two transitions so the UI can update pending counts
// without reloading the whole list.
type reportStreamAdapter struct {
	hub *stream.Hub
}

func (a *reportStreamAdapter) PublishReportCreated(rep *report.Report) {
	data, err := json.Marshal(rep)
	if err != nil {
		return
	}
	a.hub.PublishToAdmins(stream.Event{Type: "report.created", Data: string(data)})
}

func (a *reportStreamAdapter) PublishReportResolved(rep *report.Report) {
	data, err := json.Marshal(rep)
	if err != nil {
		return
	}
	a.hub.PublishToAdmins(stream.Event{Type: "report.resolved", Data: string(data)})
}

// moderationStreamAdapter satisfies moderation.Publisher by broadcasting
// warn/block verdicts to every connected admin client. Admins see new
// moderation hits appear in the dashboard without reloading; the event
// payload is the full persisted Log row so the UI can prepend directly.
type moderationStreamAdapter struct {
	hub *stream.Hub
}

func (a *moderationStreamAdapter) PublishModerationLog(row *moderation.Log) {
	data, err := json.Marshal(row)
	if err != nil {
		return
	}
	evType := "moderation." + row.Verdict // moderation.warn / moderation.block
	a.hub.PublishToAdmins(stream.Event{Type: evType, Data: string(data)})
}

// messagingStreamAdapter satisfies messaging.Publisher — emits a
// "message.new" event to the recipient and sender (for multi-tab sync).
type messagingStreamAdapter struct {
	hub *stream.Hub
}

func (a *messagingStreamAdapter) PublishMessage(userID int64, msg *messaging.Message, conv *messaging.Conversation) {
	payload := struct {
		Message      *messaging.Message      `json:"message"`
		Conversation *messaging.Conversation `json:"conversation"`
		OtherUserID  int64                   `json:"other_user_id"`
	}{Message: msg, Conversation: conv, OtherUserID: conv.Other(userID)}
	data, err := json.Marshal(payload)
	if err != nil {
		return
	}
	a.hub.Publish(userID, stream.Event{Type: "message.new", Data: string(data)})
}

// messagingNotifyAdapter satisfies messaging.Notifier — drops a notification
// into the recipient's inbox whenever they receive a new DM.
type messagingNotifyAdapter struct {
	notif *notification.Service
}

func (a *messagingNotifyAdapter) NotifyDirectMessage(recipientID, senderID int64, senderUsername, preview string) {
	a.notif.Notify(notification.Input{
		RecipientID:   recipientID,
		Type:          notification.TypeSystem,
		ActorUserID:   senderID,
		ActorUsername: senderUsername,
		Text:          "给你发了一条私信",
		Preview:       preview,
	})
}

// reportNotifyAdapter satisfies report.Notifier — pings the original reporter
// after their submission is resolved or dismissed.
type reportNotifyAdapter struct {
	notif *notification.Service
}

func (a *reportNotifyAdapter) NotifyReportHandled(
	recipientID int64, resolved bool, targetTitle, note string,
) {
	text := "驳回了你的举报"
	if resolved {
		text = "确认了你举报的内容违规"
	}
	a.notif.Notify(notification.Input{
		RecipientID: recipientID,
		Type:        notification.TypeSystem,
		TargetType:  "report",
		TargetTitle: targetTitle,
		Text:        text,
		Preview:     note,
	})
}
