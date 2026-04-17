// Package app owns the composition root: it wires every domain module
// into a runnable server. Adapters in this file bridge domain packages
// to each other without forcing them to import one another directly.
// Each adapter is a tiny struct that satisfies a consumer's narrow
// interface and forwards the call to the producing service.
package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/redup/backend/internal/audit"
	"github.com/redup/backend/internal/bot"
	"github.com/redup/backend/internal/contentfilter"
	"github.com/redup/backend/internal/credits"
	"github.com/redup/backend/internal/forum"
	"github.com/redup/backend/internal/llm"
	"github.com/redup/backend/internal/messaging"
	"github.com/redup/backend/internal/moderation"
	"github.com/redup/backend/internal/notification"
	"github.com/redup/backend/internal/platform/site"
	"github.com/redup/backend/internal/report"
	"github.com/redup/backend/internal/stream"
	"github.com/redup/backend/internal/translation"
	"github.com/redup/backend/internal/user"
)

// userLookup adapts user.Service to any domain's narrow "look up a username
// by id" interface. Reused by report, audit, follow, and anywhere else that
// needs to render @username without importing the user package.
type userLookup struct {
	userSvc *user.Service
}

func (l *userLookup) UsernameByID(id int64) (string, error) {
	if id == 0 {
		return "", nil
	}
	u, err := l.userSvc.GetByID(id)
	if err != nil || u == nil {
		return "", err
	}
	return u.Username, nil
}

func (l *userLookup) Exists(id int64) (bool, error) {
	if id == 0 {
		return false, nil
	}
	u, err := l.userSvc.GetByID(id)
	if err != nil {
		return false, nil
	}
	return u != nil, nil
}

// forumNotifyAdapter satisfies forum.Notifier and forwards into the
// notification service.
type forumNotifyAdapter struct {
	notif *notification.Service
}

func (a *forumNotifyAdapter) NotifyReply(
	recipientID, actorID int64,
	actorUsername string, actorIsAnon bool,
	targetType string, targetID int64,
	targetTitle, preview string,
	topicID int64, postFloor int,
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
		TopicID:       topicID,
		PostFloor:     postFloor,
		Text:          "回复了你",
		Preview:       preview,
	})
}

func (a *forumNotifyAdapter) NotifyLike(
	recipientID, actorID int64,
	actorUsername string,
	targetType string, targetID int64,
	targetTitle string,
	topicID int64, postFloor int,
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
		TopicID:       topicID,
		PostFloor:     postFloor,
		Text:          text,
	})
}

func (a *forumNotifyAdapter) NotifyMention(
	recipientID, actorID int64,
	actorUsername string, actorIsAnon bool,
	targetType string, targetID int64,
	targetTitle, preview string,
	topicID int64, postFloor int,
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
		TopicID:       topicID,
		PostFloor:     postFloor,
		Text:          "在帖子里 @ 了你",
		Preview:       preview,
	})
}

func (a *forumNotifyAdapter) NotifyModerationHidden(
	recipientID int64,
	targetType string, targetID int64,
	targetTitle, reason string,
	topicID int64, postFloor int,
) {
	text := "你的主题被 AI 审核隐藏"
	if targetType == "post" {
		text = "你的回复被 AI 审核隐藏"
	}
	a.notif.Notify(notification.Input{
		RecipientID: recipientID,
		Type:        notification.TypeSystem,
		TargetType:  targetType,
		TargetID:    targetID,
		TargetTitle: targetTitle,
		TopicID:     topicID,
		PostFloor:   postFloor,
		Text:        text,
		Preview:     reason,
	})
}

// registrationConfigAdapter satisfies user.RegistrationConfig by reading the
// live registration policy from site_settings.
type registrationConfigAdapter struct {
	siteSvc *site.Service
}

func (a *registrationConfigAdapter) RegistrationMode() string {
	r, err := a.siteSvc.GetRegistration()
	if err != nil {
		return "open"
	}
	return r.Mode
}

func (a *registrationConfigAdapter) InviteRequired() bool {
	r, err := a.siteSvc.GetRegistration()
	if err != nil {
		return false
	}
	return r.InviteRequired
}

func (a *registrationConfigAdapter) EmailDomainRestricted() bool {
	r, err := a.siteSvc.GetRegistration()
	if err != nil {
		return false
	}
	return r.EmailDomainRestricted
}

func (a *registrationConfigAdapter) AllowedEmailDomains() []string {
	r, err := a.siteSvc.GetRegistration()
	if err != nil {
		return nil
	}
	return r.AllowedEmailDomains
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

// forumEditWindowAdapter satisfies forum.EditWindowSource by reading the
// live post edit window from site settings.
type forumEditWindowAdapter struct {
	siteSvc *site.Service
}

func (a *forumEditWindowAdapter) PostEditWindowMinutes() int {
	b, err := a.siteSvc.GetBasic()
	if err != nil {
		return 0
	}
	return b.PostEditWindowMinutes
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
// handler needs.
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

// toRouterProviders converts the persisted site.LLMProvider shape into
// the leaner ProviderConfig the llm package uses for dispatch.
func toRouterProviders(providers []site.LLMProvider) []llm.ProviderConfig {
	out := make([]llm.ProviderConfig, 0, len(providers))
	for _, p := range providers {
		out = append(out, llm.ProviderConfig{
			ID:      p.ID,
			Kind:    p.Kind,
			BaseURL: p.BaseURL,
			APIKey:  p.APIKey,
			Enabled: p.Enabled,
		})
	}
	return out
}

// llmCallObserver persists every llm.Router.Complete invocation for the
// admin panel. Writes are best-effort: a failed log write is noted but
// never propagates back into the caller.
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
// failed webhook invocations to every connected admin.
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

// reportPenalizerAdapter satisfies report.CreditPenalizer by resolving a
// report target to its owning user and applying a credit-score delta.
// Handles all three target types: user / topic / post.
type reportPenalizerAdapter struct {
	userSvc  *user.Service
	forumSvc *forum.Service
}

func (a *reportPenalizerAdapter) PenalizeReportTarget(targetType string, targetID int64, delta int) error {
	var ownerID int64
	switch targetType {
	case "user":
		ownerID = targetID
	case "topic":
		t, err := a.forumSvc.GetTopic(targetID)
		if err != nil {
			return fmt.Errorf("topic lookup: %w", err)
		}
		if t == nil {
			return fmt.Errorf("topic %d not found", targetID)
		}
		ownerID = t.UserID
	case "post":
		p, err := a.forumSvc.GetPost(targetID)
		if err != nil {
			return fmt.Errorf("post lookup: %w", err)
		}
		if p == nil {
			return fmt.Errorf("post %d not found", targetID)
		}
		ownerID = p.UserID
	default:
		return fmt.Errorf("unsupported target type: %s", targetType)
	}
	if ownerID == 0 {
		return fmt.Errorf("anonymous / system target cannot be penalized")
	}
	if _, _, err := a.userSvc.AdjustCreditScore(ownerID, delta); err != nil {
		return fmt.Errorf("adjust credit: %w", err)
	}
	return nil
}

// reportStreamAdapter satisfies report.Publisher by broadcasting newly-filed
// and newly-handled reports to all connected admin clients.
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
// warn/block verdicts to every connected admin client.
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
