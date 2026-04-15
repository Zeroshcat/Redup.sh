package bot

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"regexp"
	"strings"
	"sync"
	"time"
	"unicode/utf8"
)

var jsonUnmarshal = json.Unmarshal

var (
	ErrInvalidSlug    = errors.New("invalid slug")
	ErrInvalidName    = errors.New("invalid name")
	ErrInvalidDesc    = errors.New("invalid description")
	ErrInvalidWebhook = errors.New("invalid webhook url")
	ErrSlugTaken      = errors.New("slug already taken")
	ErrBotNotFound    = errors.New("bot not found")
	ErrInvalidStatus  = errors.New("invalid status transition")
	ErrForbidden      = errors.New("forbidden")
)

var slugRegexp = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)

// UserLookup snapshots the owner's username at write time so the bot record
// stays self-contained.
type UserLookup interface {
	UsernameByID(id int64) (string, error)
}

// ForumContext is the narrow interface the bot trigger needs from the forum
// module to load a topic's plain-text context and post a bot reply back.
// Wired by main.go so the bot package never imports forum.
type ForumContext interface {
	LoadTopicForBot(topicID int64) (TopicSnapshot, error)
	PostBotReply(topicID, botID, ownerUserID int64, content string) error
}

// TopicSnapshot is the shape ForumContext returns: enough to build a prompt
// without exposing any internal forum types.
type TopicSnapshot struct {
	Title string
	Body  string
	Posts []PostSnapshot
}

type PostSnapshot struct {
	Floor   int
	Author  string
	Content string
	IsBot   bool
}

// TriggerConfig holds limits the trigger flow honors.
type TriggerConfig struct {
	Enabled    bool
	TimeoutSec int
	MaxContext int
}

// CallLogPublisher pushes a newly-persisted CallLog row out over the
// real-time stream. Implementations must be non-blocking — publishers are
// called from inside the bot invocation hot path and must not add latency
// to webhook delivery.
type CallLogPublisher interface {
	PublishBotCallLog(row *CallLog)
}

type Service struct {
	repo         *Repository
	users        UserLookup
	webhook      WebhookClient
	forum        ForumContext
	trigCfg      TriggerConfig
	callLogPub   CallLogPublisher
}

func NewService(repo *Repository, users UserLookup) *Service {
	return &Service{repo: repo, users: users}
}

// SetCallLogPublisher wires the stream publisher. Usage is filtered to
// failure statuses inside recordCallWithLatency so a firehose of
// successful invocations doesn't spam every admin client.
// HasActiveBot reports whether the user owns at least one active bot.
// Used by the forum service to gate topic creation in bot-type categories.
func (s *Service) HasActiveBot(userID int64) (bool, error) {
	n, err := s.repo.CountActiveByOwner(userID)
	return n > 0, err
}

func (s *Service) SetCallLogPublisher(p CallLogPublisher) {
	s.callLogPub = p
}

func (s *Service) SetTrigger(webhook WebhookClient, forum ForumContext, cfg TriggerConfig) {
	s.webhook = webhook
	s.forum = forum
	s.trigCfg = cfg
}

// botMentionRegexp matches @slug tokens — same character class as Bot.Slug
// validation. Slugs are lowercased before lookup.
var botMentionRegexp = regexp.MustCompile(`@([a-z0-9]+(?:-[a-z0-9]+)*)`)

// AsyncTrigger spawns a goroutine that scans the post content for @botslug
// mentions, calls the matching active bots' LLMs, and posts replies back via
// the forum context. Best-effort: panics are recovered, errors are logged.
// The triggerUserID is the user who authored the source post and is used as
// the actor in the call log.
func (s *Service) AsyncTrigger(topicID, sourcePostID, triggerUserID int64, content string) {
	if s == nil || !s.trigCfg.Enabled || s.webhook == nil || s.forum == nil {
		return
	}
	slugs := extractBotMentions(content)
	if len(slugs) == 0 {
		return
	}
	go func() {
		defer func() {
			if r := recover(); r != nil {
				log.Printf("bot trigger panic: %v", r)
			}
		}()
		s.processMentions(topicID, sourcePostID, triggerUserID, slugs)
	}()
}

func extractBotMentions(content string) []string {
	matches := botMentionRegexp.FindAllStringSubmatch(strings.ToLower(content), -1)
	if len(matches) == 0 {
		return nil
	}
	seen := make(map[string]struct{}, len(matches))
	out := make([]string, 0, len(matches))
	for _, m := range matches {
		if _, ok := seen[m[1]]; ok {
			continue
		}
		seen[m[1]] = struct{}{}
		out = append(out, m[1])
	}
	return out
}

func (s *Service) processMentions(topicID, sourcePostID, triggerUserID int64, slugs []string) {
	_ = sourcePostID // reserved for Phase 3+ (link the log row back to source post)
	for _, slug := range slugs {
		b, err := s.repo.BySlug(slug)
		if err != nil || b == nil {
			continue
		}
		_, _ = s.invokeOne(b, topicID, triggerUserID)
	}
}

// invokeOne runs the full pipeline for one bot against one topic: load
// context, POST event to the bot's webhook, parse reply, post it back as a
// new floor, write a call log. Returns (status, error). Used by both async
// mention fan-out and manual summon.
func (s *Service) invokeOne(b *Bot, topicID, triggerUserID int64) (string, error) {
	if s.webhook == nil || s.forum == nil {
		return CallStatusError, errors.New("bot trigger not configured")
	}
	triggerUsername := ""
	if triggerUserID > 0 && s.users != nil {
		triggerUsername, _ = s.users.UsernameByID(triggerUserID)
	}
	snapshot, err := s.forum.LoadTopicForBot(topicID)
	if err != nil {
		s.recordCall(b, triggerUserID, triggerUsername, "", topicID, 0,
			CallStatusError, "", "", err.Error())
		return CallStatusError, err
	}
	maxCtx := s.trigCfg.MaxContext
	if maxCtx <= 0 {
		maxCtx = 20
	}
	if len(snapshot.Posts) > maxCtx {
		snapshot.Posts = snapshot.Posts[len(snapshot.Posts)-maxCtx:]
	}
	if b.Status != StatusActive {
		s.recordCall(b, triggerUserID, triggerUsername, snapshot.Title, topicID, 0,
			CallStatusBlocked, summarizeSnapshot(snapshot), "", "bot is not active")
		return CallStatusBlocked, errors.New("bot is not active")
	}
	if b.WebhookURL == "" {
		s.recordCall(b, triggerUserID, triggerUsername, snapshot.Title, topicID, 0,
			CallStatusError, "", "", "bot has no webhook url configured")
		return CallStatusError, errors.New("bot has no webhook url configured")
	}

	timeout := time.Duration(s.trigCfg.TimeoutSec) * time.Second
	if timeout <= 0 {
		timeout = 15 * time.Second
	}
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	payload := WebhookPayload{
		Event:       "topic.mention",
		BotID:       b.ID,
		BotSlug:     b.Slug,
		TopicID:     topicID,
		TopicTitle:  snapshot.Title,
		TopicBody:   snapshot.Body,
		TriggerUser: triggerUsername,
	}
	for _, p := range snapshot.Posts {
		payload.RecentPosts = append(payload.RecentPosts, WebhookPayloadPost{
			Floor:   p.Floor,
			Author:  p.Author,
			Content: p.Content,
			IsBot:   p.IsBot,
		})
	}
	requestSummary := summarizeSnapshot(snapshot)

	started := time.Now()
	reply, err := s.webhook.Deliver(ctx, b.WebhookURL, b.APIKey, payload)
	latency := int(time.Since(started).Milliseconds())

	if err != nil {
		status := CallStatusError
		if ctx.Err() == context.DeadlineExceeded {
			status = CallStatusTimeout
		}
		log.Printf("bot %s: webhook failed (%dms): %v", b.Slug, latency, err)
		s.recordCallWithLatency(b, triggerUserID, triggerUsername,
			snapshot.Title, topicID, 0, status, latency, requestSummary, "", err.Error())
		return status, err
	}
	reply = strings.TrimSpace(reply)
	if reply == "" {
		s.recordCallWithLatency(b, triggerUserID, triggerUsername,
			snapshot.Title, topicID, 0, CallStatusError, latency, requestSummary, "", "empty reply from bot")
		return CallStatusError, errors.New("empty reply from bot")
	}
	if err := s.forum.PostBotReply(topicID, b.ID, b.OwnerUserID, reply); err != nil {
		log.Printf("bot %s: post reply: %v", b.Slug, err)
		s.recordCallWithLatency(b, triggerUserID, triggerUsername,
			snapshot.Title, topicID, 0, CallStatusError, latency, requestSummary, reply, err.Error())
		return CallStatusError, err
	}
	_ = s.repo.IncrementCallCount(b.ID)
	s.recordCallWithLatency(b, triggerUserID, triggerUsername,
		snapshot.Title, topicID, 0, CallStatusSuccess, latency, requestSummary, reply, "")
	return CallStatusSuccess, nil
}

// summarizeSnapshot is a compact text representation of a topic context used
// only for the call log's request_summary column. The actual JSON payload
// sent on the wire is structured.
func summarizeSnapshot(s TopicSnapshot) string {
	var sb strings.Builder
	sb.WriteString("[" + s.Title + "]\n")
	if s.Body != "" {
		sb.WriteString(s.Body + "\n")
	}
	for _, p := range s.Posts {
		sb.WriteString(fmt.Sprintf("#%d %s: %s\n", p.Floor, p.Author, p.Content))
	}
	return sb.String()
}

// ---------- Bot moderation ----------

// ModVerdict mirrors the shape a moderator bot returns from its webhook
// under the "moderation.check" event type.
type ModVerdict struct {
	BotID   int64  `json:"bot_id"`
	BotSlug string `json:"bot_slug"`
	BotName string `json:"bot_name"`
	Verdict string `json:"verdict"` // pass | warn | block | error
	Reason  string `json:"reason"`
}

// modWebhookReply is what the bot's webhook is expected to return for a
// moderation.check event. We accept the same keys as the normal reply
// contract plus an explicit verdict field.
type modWebhookReply struct {
	Verdict string `json:"verdict"`
	Reason  string `json:"reason"`
	Error   string `json:"error,omitempty"`
}

// CheckAsModerators fans out a content-moderation request to every active
// moderator bot in parallel and collects their verdicts. Non-responders
// (timeout, HTTP error, bad JSON) are reported as verdict=error and simply
// ignored by the aggregator — one broken bot never blocks a user action.
func (s *Service) CheckAsModerators(parent context.Context, content, categoryRules string) []ModVerdict {
	if s.webhook == nil {
		return nil
	}
	bots, err := s.repo.ListActiveModerators()
	if err != nil || len(bots) == 0 {
		return nil
	}
	timeout := time.Duration(s.trigCfg.TimeoutSec) * time.Second
	if timeout <= 0 {
		timeout = 5 * time.Second
	}
	ctx, cancel := context.WithTimeout(parent, timeout)
	defer cancel()

	type result struct {
		v ModVerdict
	}
	results := make(chan result, len(bots))
	var wg sync.WaitGroup
	for _, b := range bots {
		wg.Add(1)
		go func(b Bot) {
			defer wg.Done()
			defer func() {
				if r := recover(); r != nil {
					log.Printf("bot moderator %s panic: %v", b.Slug, r)
				}
			}()
			v := ModVerdict{BotID: b.ID, BotSlug: b.Slug, BotName: b.Name}
			payload := WebhookPayload{
				Event:      "moderation.check",
				BotID:      b.ID,
				BotSlug:    b.Slug,
				TopicTitle: categoryRules, // reused field as "rules hint" for bot devs
				TopicBody:  content,
			}
			raw, err := s.webhook.Deliver(ctx, b.WebhookURL, b.APIKey, payload)
			if err != nil {
				v.Verdict = "error"
				v.Reason = err.Error()
				results <- result{v}
				return
			}
			// Try to parse as the expected moderation reply shape. Fall back
			// to looking at the plain reply text for leniency.
			var parsed modWebhookReply
			if jerr := parseJSON(raw, &parsed); jerr == nil && parsed.Verdict != "" {
				v.Verdict = parsed.Verdict
				v.Reason = parsed.Reason
			} else {
				v.Verdict = "pass"
				v.Reason = raw
			}
			if v.Verdict != "pass" && v.Verdict != "warn" && v.Verdict != "block" {
				v.Verdict = "pass"
			}
			results <- result{v}
		}(b)
	}
	wg.Wait()
	close(results)

	out := make([]ModVerdict, 0, len(bots))
	for r := range results {
		out = append(out, r.v)
	}
	return out
}

// parseJSON is a lenient helper that strips common wrapping (markdown code
// fences, surrounding whitespace) before unmarshalling.
func parseJSON(raw string, dst interface{}) error {
	raw = strings.TrimSpace(raw)
	raw = strings.TrimPrefix(raw, "```json")
	raw = strings.TrimPrefix(raw, "```")
	raw = strings.TrimSuffix(raw, "```")
	raw = strings.TrimSpace(raw)
	if !strings.HasPrefix(raw, "{") {
		return errors.New("not json")
	}
	return jsonUnmarshal([]byte(raw), dst)
}

// ManualInvoke is the sync entry point for the user-facing summon button.
// Looks up the bot by slug and runs invokeOne.
func (s *Service) ManualInvoke(slug string, topicID, triggerUserID int64) error {
	if !s.trigCfg.Enabled {
		return errors.New("bot trigger is disabled on this server")
	}
	b, err := s.repo.BySlug(slug)
	if err != nil {
		return err
	}
	if b == nil {
		return ErrBotNotFound
	}
	if b.Status != StatusActive {
		return errors.New("bot is not active")
	}
	_, err = s.invokeOne(b, topicID, triggerUserID)
	return err
}

func (s *Service) recordCall(b *Bot, userID int64, username, topicTitle string,
	topicID int64, floor int, status, prompt, reply, errMsg string,
) {
	s.recordCallWithLatency(b, userID, username, topicTitle, topicID, floor, status, 0, prompt, reply, errMsg)
}

func (s *Service) recordCallWithLatency(b *Bot, userID int64, username, topicTitle string,
	topicID int64, floor int, status string, latencyMs int,
	prompt, reply, errMsg string,
) {
	if s.repo == nil {
		return
	}
	cl := &CallLog{
		BotID:           b.ID,
		BotSlug:         b.Slug,
		BotName:         b.Name,
		TriggerUserID:   userID,
		TriggerUsername: username,
		TopicID:         topicID,
		TopicTitle:      truncRunes(topicTitle, 256),
		PostFloor:       floor,
		Status:          status,
		LatencyMs:       latencyMs,
		RequestSummary:  truncRunes(prompt, 800),
		ResponseSummary: truncRunes(reply, 800),
		ErrorMessage:    truncRunes(errMsg, 400),
	}
	if err := s.repo.LogCall(cl); err != nil {
		log.Printf("bot call log write failed: %v", err)
		return
	}
	// Publish only failure rows. Success logs are high-volume background
	// chatter — admins watching the dashboard care about "something broke",
	// not the green-path trail. The bot-logs page still sees successes via
	// its regular REST list endpoint.
	if s.callLogPub != nil && (status == CallStatusError || status == CallStatusTimeout || status == CallStatusBlocked) {
		s.callLogPub.PublishBotCallLog(cl)
	}
}

func truncRunes(s string, max int) string {
	runes := []rune(s)
	if len(runes) <= max {
		return s
	}
	return string(runes[:max])
}

// ---------- Public list for admin ----------

func (s *Service) ListCalls(opts CallLogListOptions) ([]CallLog, int64, error) {
	return s.repo.ListCalls(opts)
}

func (s *Service) CallStats() (map[string]int64, error) {
	return s.repo.CallStats()
}

type Input struct {
	Slug          string
	Name          string
	Description   string
	AvatarURL     string
	ModelProvider string // free-form display label
	ModelName     string // free-form display label
	WebhookURL    string
	APIKey        string
	SystemPrompt  string
	Tags          string
}

func (s *Service) validate(in *Input) error {
	in.Slug = strings.TrimSpace(strings.ToLower(in.Slug))
	in.Name = strings.TrimSpace(in.Name)
	in.Description = strings.TrimSpace(in.Description)
	in.ModelProvider = strings.TrimSpace(in.ModelProvider)
	in.ModelName = strings.TrimSpace(in.ModelName)
	in.WebhookURL = strings.TrimSpace(in.WebhookURL)
	in.APIKey = strings.TrimSpace(in.APIKey)
	in.SystemPrompt = strings.TrimSpace(in.SystemPrompt)
	in.Tags = strings.TrimSpace(in.Tags)

	if l := len(in.Slug); l < 3 || l > 32 || !slugRegexp.MatchString(in.Slug) {
		return ErrInvalidSlug
	}
	if n := utf8.RuneCountInString(in.Name); n < 2 || n > 32 {
		return ErrInvalidName
	}
	if n := utf8.RuneCountInString(in.Description); n < 10 || n > 512 {
		return ErrInvalidDesc
	}
	if in.WebhookURL == "" {
		return ErrInvalidWebhook
	}
	if !strings.HasPrefix(in.WebhookURL, "https://") && !strings.HasPrefix(in.WebhookURL, "http://") {
		return ErrInvalidWebhook
	}
	return nil
}

// Submit creates a pending bot application from the given owner.
func (s *Service) Submit(ownerID int64, in Input) (*Bot, error) {
	if ownerID == 0 {
		return nil, ErrForbidden
	}
	if err := s.validate(&in); err != nil {
		return nil, err
	}
	if existing, err := s.repo.BySlug(in.Slug); err != nil {
		return nil, err
	} else if existing != nil {
		return nil, ErrSlugTaken
	}
	username := ""
	if s.users != nil {
		username, _ = s.users.UsernameByID(ownerID)
	}
	b := &Bot{
		Slug:          in.Slug,
		Name:          in.Name,
		Description:   in.Description,
		AvatarURL:     in.AvatarURL,
		OwnerUserID:   ownerID,
		OwnerUsername: username,
		ModelProvider: in.ModelProvider,
		ModelName:     in.ModelName,
		WebhookURL:    in.WebhookURL,
		APIKey:        in.APIKey,
		SystemPrompt:  in.SystemPrompt,
		Tags:          in.Tags,
		Status:        StatusPending,
	}
	if err := s.repo.Create(b); err != nil {
		return nil, err
	}
	return b, nil
}

// Update lets the owner edit non-status fields. Slug cannot be changed.
func (s *Service) Update(ownerID, id int64, in Input) (*Bot, error) {
	current, err := s.repo.ByID(id)
	if err != nil {
		return nil, err
	}
	if current == nil {
		return nil, ErrBotNotFound
	}
	if current.OwnerUserID != ownerID {
		return nil, ErrForbidden
	}
	in.Slug = current.Slug // owner cannot change slug after creation
	if err := s.validate(&in); err != nil {
		return nil, err
	}
	current.Name = in.Name
	current.Description = in.Description
	current.AvatarURL = in.AvatarURL
	current.ModelProvider = in.ModelProvider
	current.ModelName = in.ModelName
	current.WebhookURL = in.WebhookURL
	if in.APIKey != "" {
		current.APIKey = in.APIKey
	}
	current.SystemPrompt = in.SystemPrompt
	current.Tags = in.Tags
	if err := s.repo.Update(current); err != nil {
		return nil, err
	}
	return current, nil
}

// Delete removes the bot. Owner can delete their own; admin uses this too.
func (s *Service) Delete(actorID int64, isAdmin bool, id int64) error {
	current, err := s.repo.ByID(id)
	if err != nil {
		return err
	}
	if current == nil {
		return ErrBotNotFound
	}
	if !isAdmin && current.OwnerUserID != actorID {
		return ErrForbidden
	}
	return s.repo.Delete(id)
}

func (s *Service) ByID(id int64) (*Bot, error) {
	b, err := s.repo.ByID(id)
	if err != nil {
		return nil, err
	}
	if b == nil {
		return nil, ErrBotNotFound
	}
	return b, nil
}

// BySlug returns a bot by slug. Inactive bots are visible only to their
// owner or to admins; the caller decides via viewerID + isAdmin.
func (s *Service) BySlug(slug string, viewerID int64, isAdmin bool) (*Bot, error) {
	b, err := s.repo.BySlug(slug)
	if err != nil {
		return nil, err
	}
	if b == nil {
		return nil, ErrBotNotFound
	}
	if b.Status != StatusActive && !isAdmin && b.OwnerUserID != viewerID {
		return nil, ErrBotNotFound
	}
	return b, nil
}

func (s *Service) ListPublic(opts ListOptions) ([]Bot, int64, error) {
	opts.Status = StatusActive
	return s.repo.List(opts)
}

func (s *Service) ListAdmin(opts ListOptions) ([]Bot, int64, error) {
	return s.repo.List(opts)
}

// ---------- Admin status transitions ----------

func (s *Service) Approve(adminID int64, id int64) (*Bot, error) {
	b, err := s.repo.ByID(id)
	if err != nil {
		return nil, err
	}
	if b == nil {
		return nil, ErrBotNotFound
	}
	if b.Status != StatusPending && b.Status != StatusSuspended {
		return nil, ErrInvalidStatus
	}
	now := time.Now()
	b.Status = StatusActive
	b.ApprovedBy = adminID
	b.ApprovedAt = &now
	b.RejectionNote = ""
	if err := s.repo.UpdateStatus(b); err != nil {
		return nil, err
	}
	return b, nil
}

func (s *Service) Reject(adminID int64, id int64, note string) (*Bot, error) {
	b, err := s.repo.ByID(id)
	if err != nil {
		return nil, err
	}
	if b == nil {
		return nil, ErrBotNotFound
	}
	if b.Status != StatusPending {
		return nil, ErrInvalidStatus
	}
	note = strings.TrimSpace(note)
	if r := utf8.RuneCountInString(note); r > 500 {
		runes := []rune(note)
		note = string(runes[:500])
	}
	b.Status = StatusRejected
	b.RejectionNote = note
	b.ApprovedBy = adminID
	if err := s.repo.UpdateStatus(b); err != nil {
		return nil, err
	}
	return b, nil
}

func (s *Service) Suspend(adminID int64, id int64, note string) (*Bot, error) {
	b, err := s.repo.ByID(id)
	if err != nil {
		return nil, err
	}
	if b == nil {
		return nil, ErrBotNotFound
	}
	if b.Status != StatusActive {
		return nil, ErrInvalidStatus
	}
	note = strings.TrimSpace(note)
	if r := utf8.RuneCountInString(note); r > 500 {
		runes := []rune(note)
		note = string(runes[:500])
	}
	b.Status = StatusSuspended
	b.RejectionNote = note
	b.ApprovedBy = adminID
	if err := s.repo.UpdateStatus(b); err != nil {
		return nil, err
	}
	return b, nil
}

func (s *Service) Feature(id int64, featured bool) (*Bot, error) {
	b, err := s.repo.ByID(id)
	if err != nil {
		return nil, err
	}
	if b == nil {
		return nil, ErrBotNotFound
	}
	if err := s.repo.UpdateFeatured(id, featured); err != nil {
		return nil, err
	}
	b.IsFeatured = featured
	return b, nil
}

func (s *Service) SetModerator(id int64, enabled bool) (*Bot, error) {
	b, err := s.repo.ByID(id)
	if err != nil {
		return nil, err
	}
	if b == nil {
		return nil, ErrBotNotFound
	}
	if enabled && b.Status != StatusActive {
		return nil, ErrInvalidStatus
	}
	if err := s.repo.UpdateModerator(id, enabled); err != nil {
		return nil, err
	}
	b.IsModerator = enabled
	return b, nil
}
