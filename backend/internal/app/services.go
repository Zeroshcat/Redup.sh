package app

import (
	"fmt"
	"log"
	"strings"
	"time"

	"gorm.io/gorm"

	"github.com/redup/backend/config"
	"github.com/redup/backend/internal/announcement"
	"github.com/redup/backend/internal/anon"
	"github.com/redup/backend/internal/audit"
	"github.com/redup/backend/internal/auth"
	"github.com/redup/backend/internal/bot"
	"github.com/redup/backend/internal/contentfilter"
	"github.com/redup/backend/internal/credits"
	"github.com/redup/backend/internal/follow"
	"github.com/redup/backend/internal/forum"
	"github.com/redup/backend/internal/invite"
	httpx "github.com/redup/backend/internal/http"
	"github.com/redup/backend/internal/linkpreview"
	"github.com/redup/backend/internal/llm"
	"github.com/redup/backend/internal/mailer"
	"github.com/redup/backend/internal/messaging"
	"github.com/redup/backend/internal/moderation"
	"github.com/redup/backend/internal/notification"
	"github.com/redup/backend/internal/platform/site"
	"github.com/redup/backend/internal/report"
	"github.com/redup/backend/internal/skills"
	"github.com/redup/backend/internal/stream"
	"github.com/redup/backend/internal/translation"
	"github.com/redup/backend/internal/user"

	redis "github.com/redis/go-redis/v9"
	redisx "github.com/redup/backend/internal/redis"
)

// services is the internal composition root — every long-lived object the
// server needs at runtime lives here. Fields are populated in dependency
// order by buildServices and then handed to mountRoutes for wiring onto
// a gin.Engine. Nothing outside this package should reach into these
// fields; the only external consumer is routes.go (same package).
type services struct {
	cfg *config.Config
	db  *gorm.DB
	rdb *redis.Client

	// Core infra
	jwtMgr      *auth.JWTManager
	rateLimiter *httpx.RateLimiter
	streamHub   *stream.Hub
	anonGen     *anon.Generator

	// Domain services
	userSvc         *user.Service
	anonSvc         *anon.Service
	siteSvc         *site.Service
	creditsSvc     *credits.Service
	llmRouter      *llm.Router
	llmSvc         *llm.Service
	mailerSvc      *mailer.Service
	linkPreviewSvc *linkpreview.Service
	translationSvc *translation.Service
	cfSvc          *contentfilter.Service
	moderationSvc  *moderation.Service
	auditSvc       *audit.Service
	notifSvc       *notification.Service
	messagingSvc   *messaging.Service
	followSvc      *follow.Service
	botSvc         *bot.Service
	botWebhook     *bot.HTTPWebhookClient
	reportSvc      *report.Service
	forumSvc       *forum.Service
	announcementSvc *announcement.Service
	inviteSvc       *invite.Service
	skillHandler   *skills.Handler

	// Handlers
	userHandler         *user.Handler
	siteHandler         *site.Handler
	creditsHandler      *credits.Handler
	llmHandler          *llm.Handler
	mailerHandler       *mailer.Handler
	linkPreviewHandler  *linkpreview.Handler
	translationHandler  *translation.Handler
	cfHandler           *contentfilter.Handler
	moderationHandler   *moderation.Handler
	auditHandler        *audit.Handler
	notifHandler        *notification.Handler
	messagingHandler    *messaging.Handler
	followHandler       *follow.Handler
	botHandler          *bot.Handler
	reportHandler       *report.Handler
	forumHandler        *forum.Handler
	streamHandler       *stream.Handler
	announcementHandler *announcement.Handler
	inviteHandler       *invite.Handler
	anonAdminHandler    *anon.Handler
}

// buildServices assembles every long-lived component in dependency order
// and returns them in one bag. Construction has side effects — site
// settings are seeded, the first admin is auto-promoted, site.basic is
// read to configure the webhook proxy — so this is not pure. Returning
// an error lets the caller bail cleanly on startup failures the old code
// handled via log.Fatalf; we now fail up to main() and let it decide.
func buildServices(cfg *config.Config, database *gorm.DB, rdb *redis.Client) (*services, error) {
	s := &services{cfg: cfg, db: database, rdb: rdb}

	// Rate limiter + login guard: both redis-backed, constructed once and
	// shared across every route group via httpx/redis middleware.
	s.rateLimiter = httpx.NewRateLimiter(rdb)
	loginGuard := redisx.NewLoginGuard(rdb, 5, 10*60, 15*60) // 5/10min → 15min lock

	s.jwtMgr = auth.NewJWTManager(
		cfg.JWTAccessSecret,
		cfg.JWTRefreshSecret,
		cfg.JWTAccessTTLMin,
		cfg.JWTRefreshTTLDay,
	)
	s.jwtMgr.SetRevoker(redisx.NewRevoker(rdb))

	// --- user ---
	userRepo := user.NewRepository(database)
	if promoted, err := userRepo.EnsureAdminExists(); err != nil {
		return nil, fmt.Errorf("admin bootstrap: %w", err)
	} else if promoted {
		log.Println("no admin found — promoted earliest user to admin")
	}
	s.userSvc = user.NewService(userRepo)
	s.userSvc.SetLoginGuard(loginGuard)
	s.userHandler = user.NewHandler(s.userSvc, s.jwtMgr)

	uLookup := &userLookup{userSvc: s.userSvc}

	// --- invite codes ---
	inviteRepo := invite.NewRepository(database)
	s.inviteSvc = invite.NewService(inviteRepo)
	s.inviteHandler = invite.NewHandler(s.inviteSvc)

	// --- anon ---
	anonRepo := anon.NewRepository(database)
	s.anonGen = anon.NewGenerator(int64(cfg.SnowflakeNodeID), cfg.AnonIDPrefix)
	s.anonSvc = anon.NewService(anonRepo, s.anonGen)
	log.Printf("anon id format: %s-<snowflake>", s.anonGen.Prefix())

	// --- site settings (seed first so reads below see defaults) ---
	siteRepo := site.NewRepository(database)
	s.siteSvc = site.NewService(siteRepo)
	if err := s.siteSvc.SeedDefaults(); err != nil {
		return nil, fmt.Errorf("site seed: %w", err)
	}
	if savedAnon, err := s.siteSvc.GetAnon(); err == nil && savedAnon.Prefix != "" {
		s.anonGen.SetPrefix(savedAnon.Prefix)
		log.Printf("anon prefix loaded from db: %s", savedAnon.Prefix)
	}
	s.siteSvc.OnAnonPrefixChange(func(p string) {
		s.anonGen.SetPrefix(p)
		log.Printf("anon prefix updated at runtime: %s", p)
	})
	s.siteHandler = site.NewHandler(s.siteSvc)

	// --- mailer (hot-reloaded from site.smtp) ---
	s.mailerSvc = mailer.New()
	if smtp, err := s.siteSvc.GetSMTP(); err == nil {
		s.mailerSvc.SetConfig(toMailerConfig(smtp))
		if smtp.Enabled {
			log.Printf("mailer enabled: host=%s port=%d encryption=%s from=%s",
				smtp.Host, smtp.Port, smtp.Encryption, smtp.FromAddress)
		}
	}
	s.siteSvc.OnSMTPChange(func(v site.SMTP) {
		s.mailerSvc.SetConfig(toMailerConfig(v))
		if v.Enabled {
			log.Printf("mailer updated at runtime: host=%s port=%d encryption=%s", v.Host, v.Port, v.Encryption)
		} else {
			log.Printf("mailer disabled at runtime")
		}
	})
	s.mailerHandler = mailer.NewHandler(s.mailerSvc)

	// --- link-preview (OG fetcher + Redis cache) ---
	if cfg.LinkPreviewAllowCIDRs != "" {
		linkpreview.SetAllowedNets(strings.Split(cfg.LinkPreviewAllowCIDRs, ","))
		log.Printf("link-preview ssrf allow-list: %s", cfg.LinkPreviewAllowCIDRs)
	}
	s.linkPreviewSvc = linkpreview.New(rdb, &linkPreviewPolicyAdapter{siteSvc: s.siteSvc})
	s.linkPreviewHandler = linkpreview.NewHandler(s.linkPreviewSvc)

	// Wire registration policy enforcement into the user service. The
	// adapter reads the live registration config from site_settings; the
	// invite validator lets the user service check + consume codes without
	// importing the invite package directly.
	s.userSvc.SetRegistrationConfig(&registrationConfigAdapter{siteSvc: s.siteSvc})
	s.userSvc.SetInviteValidator(s.inviteSvc)

	// Wire outbound mail + verification-code store so registration can
	// send codes and the verify-email endpoint can redeem them. 15-min
	// code TTL, 60s resend cooldown. Password-reset tokens share the
	// same Redis but with a longer 1-hour TTL since the user has to
	// check their inbox and click through.
	s.userSvc.SetMailSender(&userMailSenderAdapter{mailer: s.mailerSvc})
	s.userSvc.SetVerifyCodeStore(redisx.NewMailVerifyStore(rdb, 15*time.Minute, 60))
	s.userSvc.SetPasswordResetStore(redisx.NewPasswordResetStore(rdb, time.Hour, 60))
	frontendURL := cfg.FrontendURL
	s.userSvc.SetResetLinkBase(func() string { return frontendURL })
	s.userSvc.SetSiteNameFn(func() string {
		basic, err := s.siteSvc.GetBasic()
		if err != nil {
			return ""
		}
		return basic.Name
	})

	// --- credits / wallet ---
	creditsRepo := credits.NewRepository(database)
	s.creditsSvc = credits.NewService(creditsRepo, &creditsConfigAdapter{siteSvc: s.siteSvc})
	s.creditsHandler = credits.NewHandler(s.creditsSvc)
	s.userSvc.SetCreditsAwarder(s.creditsSvc)
	s.userHandler.SetLevelComputer(s.creditsSvc)

	// --- platform llm router (hot-reloadable providers) ---
	s.llmRouter = llm.NewRouter()
	s.llmRouter.SetTimeout(time.Duration(cfg.BotTimeoutSec) * time.Second)

	llmRepo := llm.NewRepository(database)
	s.llmRouter.SetObserver(&llmCallObserver{repo: llmRepo})
	s.llmSvc = llm.NewService(s.llmRouter)
	s.llmSvc.SetRepository(llmRepo)
	s.llmHandler = llm.NewHandler(s.llmSvc)

	if savedLLM, err := s.siteSvc.GetLLM(); err == nil {
		s.llmRouter.ReplaceProviders(toRouterProviders(savedLLM.Providers))
	}
	s.siteSvc.OnLLMChange(func(v site.LLM) {
		s.llmRouter.ReplaceProviders(toRouterProviders(v.Providers))
		log.Printf("llm providers reloaded: %v", s.llmRouter.Available())
	})
	log.Printf("platform llm providers: %v", s.llmRouter.Available())

	// --- translation ---
	translationRepo := translation.NewRepository(database)
	s.translationSvc = translation.NewService(
		translationRepo,
		s.llmRouter,
		&translationWalletAdapter{creditsSvc: s.creditsSvc},
		&translationConfigAdapter{siteSvc: s.siteSvc},
	)
	s.translationHandler = translation.NewHandler(s.translationSvc)

	// --- content filter ---
	cfRepo := contentfilter.NewRepository(database)
	s.cfSvc = contentfilter.NewService(cfRepo)
	s.cfHandler = contentfilter.NewHandler(s.cfSvc)

	// --- moderation (llm-backed content audit) ---
	moderationRepo := moderation.NewRepository(database)
	s.moderationSvc = moderation.NewService(
		moderationRepo,
		s.llmRouter,
		&moderationConfigAdapter{siteSvc: s.siteSvc},
		uLookup,
	)
	s.moderationHandler = moderation.NewHandler(s.moderationSvc)

	// --- audit ---
	auditRepo := audit.NewRepository(database)
	s.auditSvc = audit.NewService(auditRepo, uLookup)
	s.auditHandler = audit.NewHandler(s.auditSvc)

	// --- stream hub + handlers that push onto it ---
	s.streamHub = stream.NewHub()
	s.streamHandler = stream.NewHandler(s.streamHub, s.jwtMgr)

	notifRepo := notification.NewRepository(database)
	s.notifSvc = notification.NewService(notifRepo)
	s.notifSvc.SetPublisher(&notificationStreamAdapter{hub: s.streamHub})
	s.moderationSvc.SetPublisher(&moderationStreamAdapter{hub: s.streamHub})
	s.notifHandler = notification.NewHandler(s.notifSvc)

	messagingRepo := messaging.NewRepository(database)
	s.messagingSvc = messaging.NewService(messagingRepo, uLookup)
	s.messagingSvc.SetNotifier(&messagingNotifyAdapter{notif: s.notifSvc})
	s.messagingSvc.SetPublisher(&messagingStreamAdapter{hub: s.streamHub})
	s.messagingHandler = messaging.NewHandler(s.messagingSvc)

	followRepo := follow.NewRepository(database)
	s.followSvc = follow.NewService(followRepo, uLookup)
	s.followSvc.SetNotifier(&followNotifyAdapter{notif: s.notifSvc})
	s.followHandler = follow.NewHandler(s.followSvc, s.jwtMgr)

	// --- bot (+ webhook client with hot-reloadable outbound proxy) ---
	botRepo := bot.NewRepository(database)
	s.botSvc = bot.NewService(botRepo, uLookup)
	s.botSvc.SetCallLogPublisher(&botCallLogStreamAdapter{hub: s.streamHub})
	s.botHandler = bot.NewHandler(s.botSvc, s.jwtMgr)

	s.botWebhook = bot.NewHTTPWebhookClient(time.Duration(cfg.BotTimeoutSec) * time.Second)
	if basic, err := s.siteSvc.GetBasic(); err == nil && basic.OutboundProxyURL != "" {
		if err := s.botWebhook.SetProxy(basic.OutboundProxyURL); err != nil {
			log.Printf("bot webhook proxy rejected at boot: %v", err)
		} else {
			log.Printf("bot webhook proxy enabled: %s", basic.OutboundProxyURL)
		}
	}
	// Capture botWebhook by value so the closure doesn't need to walk the
	// services struct pointer — stays valid for the lifetime of the server.
	webhook := s.botWebhook
	s.siteSvc.OnBasicChange(func(b site.Basic) {
		if err := webhook.SetProxy(b.OutboundProxyURL); err != nil {
			log.Printf("bot webhook proxy update failed: %v", err)
			return
		}
		if b.OutboundProxyURL == "" {
			log.Printf("bot webhook proxy disabled")
		} else {
			log.Printf("bot webhook proxy updated at runtime: %s", b.OutboundProxyURL)
		}
	})
	if cfg.BotEnabled {
		log.Println("bot trigger enabled (webhook delivery mode)")
	}

	// --- report ---
	reportRepo := report.NewRepository(database)
	s.reportSvc = report.NewService(reportRepo)
	s.reportHandler = report.NewHandler(s.reportSvc, uLookup)

	// --- forum (depends on anon, filter, moderator, site, bot ownership) ---
	forumRepo := forum.NewRepository(database)
	if err := forumRepo.SeedDefaultCategories(); err != nil {
		return nil, fmt.Errorf("category seed: %w", err)
	}
	s.forumSvc = forum.NewService(forumRepo, s.anonSvc)
	s.forumSvc.SetNotifier(&forumNotifyAdapter{notif: s.notifSvc})
	s.forumSvc.SetCreditsAwarder(s.creditsSvc)
	s.forumSvc.SetContentFilter(&forumFilterAdapter{cfSvc: s.cfSvc})
	s.forumSvc.SetModerator(&forumModeratorAdapter{modSvc: s.moderationSvc})
	s.forumSvc.SetEditWindow(&forumEditWindowAdapter{siteSvc: s.siteSvc})
	s.forumSvc.SetBotOwnership(s.botSvc)

	// Back-references that need forum / report / bot to all exist first.
	s.moderationSvc.SetReporter(&moderationReportAdapter{reportSvc: s.reportSvc})
	s.moderationSvc.SetBotPanel(&botModerationAdapter{botSvc: s.botSvc})
	s.reportSvc.SetNotifier(&reportNotifyAdapter{notif: s.notifSvc})
	s.reportSvc.SetPublisher(&reportStreamAdapter{hub: s.streamHub})
	s.reportSvc.SetCreditPenalizer(&reportPenalizerAdapter{userSvc: s.userSvc, forumSvc: s.forumSvc})

	// Bot ↔ forum bidirectional trigger — bot webhook calls forum.PostBotReply,
	// forum @mention pings bot.AsyncTrigger.
	s.botSvc.SetTrigger(s.botWebhook, &botForumAdapter{forumSvc: s.forumSvc}, bot.TriggerConfig{
		Enabled:    cfg.BotEnabled,
		TimeoutSec: cfg.BotTimeoutSec,
		MaxContext: cfg.BotMaxContext,
	})
	s.forumSvc.SetBotTrigger(s.botSvc)

	s.forumHandler = forum.NewHandler(s.forumSvc, s.jwtMgr)

	// --- announcement ---
	announcementRepo := announcement.NewRepository(database)
	s.announcementSvc = announcement.NewService(announcementRepo)
	s.announcementHandler = announcement.NewHandler(s.announcementSvc)

	// --- anon admin handler (audit-wrapped) ---
	s.anonAdminHandler = anon.NewHandler(s.anonSvc)
	s.anonAdminHandler.SetAuditRecorder(&anonAuditRecorder{svc: s.auditSvc})

	// --- skills (bot reverse-call API) ---
	s.skillHandler = skills.NewHandler(s.botSvc, s.forumSvc, s.auditSvc)

	// Audit recorders into every admin handler before routes mount. We
	// do it here (not in routes.go) so the wiring stays next to the
	// handlers they affect.
	s.inviteHandler.SetAudit(s.auditSvc)
	s.forumHandler.SetAudit(s.auditSvc)
	s.userHandler.SetAudit(s.auditSvc)
	s.reportHandler.SetAudit(s.auditSvc)
	s.siteHandler.SetAudit(s.auditSvc)
	s.botHandler.SetAudit(s.auditSvc)
	s.cfHandler.SetAudit(s.auditSvc)
	s.announcementHandler.SetAudit(s.auditSvc)
	s.mailerHandler.SetAudit(s.auditSvc)

	return s, nil
}
