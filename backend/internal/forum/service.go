package forum

import (
	"errors"
	"log"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/redup/backend/internal/platform/rbac"
)

var (
	ErrCategoryNotFound  = errors.New("category not found")
	ErrTopicNotFound     = errors.New("topic not found")
	ErrTopicLocked       = errors.New("topic is locked")
	ErrInvalidTitle      = errors.New("invalid title")
	ErrInvalidContent    = errors.New("invalid content")
	ErrInvalidCategory   = errors.New("invalid category")
	ErrCategorySlugTaken = errors.New("category slug taken")
	ErrCategoryInUse     = errors.New("category has topics")
	ErrCannotMove        = errors.New("cannot move further")
	ErrInvalidPinLevel   = errors.New("invalid pin level")
	ErrContentBlocked    = errors.New("content blocked by filter")
	ErrModerationBlocked = errors.New("content blocked by moderator")
	ErrPostNotFound       = errors.New("post not found")
	ErrEditForbidden      = errors.New("edit forbidden")
	ErrEditWindowExpired  = errors.New("edit window expired")
	ErrInvalidReadLevel    = errors.New("invalid read level")
	ErrDuplicateSubmission = errors.New("duplicate submission")
	ErrBotRequired         = errors.New("bot ownership required")
)

// BotOwnershipChecker is the narrow interface forum uses to verify a
// user owns at least one active bot — gates topic creation in bot-type
// categories. Kept as an interface so forum doesn't import bot.
type BotOwnershipChecker interface {
	HasActiveBot(userID int64) (bool, error)
}

// duplicateWindow is how long the dedup window looks back for a matching
// topic/post from the same author. 10 seconds comfortably covers rapid
// double-click mis-fires without rejecting genuine re-post attempts.
const duplicateWindow = 10 * time.Second

// EditWindowSource lets the forum service read the current edit window
// (in minutes) from site settings without importing the site package.
// A zero return disables the author-edit path; only EditAny bypasses.
type EditWindowSource interface {
	PostEditWindowMinutes() int
}

var slugRegexp = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)

const (
	categoryTypeNormal = "normal"
	categoryTypeAnon   = "anon"
	categoryTypeBot    = "bot"
)

// AnonAssigner is the narrow interface forum needs from the anon module. Keeping
// it as an interface avoids a hard dependency and makes testing trivial.
type AnonAssigner interface {
	Assign(topicID, userID, postID int64) (string, error)
}

// ContentFilter is the narrow interface forum uses to screen content for
// banned words. A non-nil hit slice with severity=block aborts the action.
type ContentFilter interface {
	Check(text string) []FilterHit
}

// Moderator is the narrow interface forum uses to ask the platform LLM
// whether content violates the live site rules. The result is best-effort:
// an unconfigured/disabled moderator returns Verdict="pass" and lets the
// post through. categoryRules is optional — when non-empty the moderator
// should append it to the global rules prompt as "本板规则".
type Moderator interface {
	Check(actorID int64, targetType, content, categoryRules string) ModerationResult
	LinkTarget(logID, targetID int64)
	GenerateRewrite(content, reason, categoryRules string) string
}

// ModerationResult mirrors moderation.Result so forum stays import-free.
type ModerationResult struct {
	LogID   int64
	Verdict string
	Reason  string
	Blocked bool
}

// BlockedError is returned from CreateTopic/CreatePost when moderation
// rejects the content. Handlers should inspect Suggestion via errors.As and
// surface it to the client so the user can accept the rewrite.
type BlockedError struct {
	Reason     string
	Suggestion string
}

func (e *BlockedError) Error() string {
	return "moderation blocked: " + e.Reason
}

// FilterHit mirrors contentfilter.Hit so forum stays import-free.
type FilterHit struct {
	Word     string
	Severity string
}

// CreditsAwarder is the narrow interface forum uses to grant XP/credits when
// users contribute (post, get liked). Wired by main.go and may be nil.
type CreditsAwarder interface {
	Award(userID int64, kind, refType string, refID int64, note string)
	AwardLikeReceived(recipientID int64, refType string, refID, actorID int64, note string)
	MinTopicLength() int
	MinPostLength() int
}

// BotTrigger is the narrow interface forum uses to fan-out @botslug mentions
// to the bot module after a post is created. Wired by main.go and may be nil.
type BotTrigger interface {
	AsyncTrigger(topicID, sourcePostID, triggerUserID int64, content string)
}

// Notifier is the narrow interface forum needs to emit notifications when a
// reply or like targets another user. Wired by main.go and may be nil in tests.
//
// topicID + postFloor on every signature are what the frontend uses to build
// the click-through URL (/topic/{topicID}#floor-{postFloor}). Callers MUST
// pass topicID for every notification — leaving it zero yields a dead link.
// postFloor is zero for topic-scoped notifications and equal to the reply's
// floor number for post-scoped ones.
type Notifier interface {
	NotifyReply(recipientID, actorID int64, actorUsername string, actorIsAnon bool,
		targetType string, targetID int64, targetTitle, preview string,
		topicID int64, postFloor int)
	NotifyLike(recipientID, actorID int64, actorUsername string,
		targetType string, targetID int64, targetTitle string,
		topicID int64, postFloor int)
	NotifyMention(recipientID, actorID int64, actorUsername string, actorIsAnon bool,
		targetType string, targetID int64, targetTitle, preview string,
		topicID int64, postFloor int)
	// NotifyModerationHidden fires after async AI moderation removes the
	// author's own content. targetType is "topic" or "post"; reason
	// carries the moderator's rejection text so the author can see why.
	NotifyModerationHidden(recipientID int64, targetType string, targetID int64,
		targetTitle, reason string,
		topicID int64, postFloor int)
}

// mentionRegexp matches @username tokens in user-generated content. The
// trailing word boundary is enforced by the [a-zA-Z0-9_-] character class
// which simply stops consuming once it hits any other character.
var mentionRegexp = regexp.MustCompile(`@([a-zA-Z][a-zA-Z0-9_-]{2,31})`)

// extractMentions returns the unique set of mentioned usernames in content,
// preserving original casing. Caller is responsible for resolving them to
// actual user ids via the repo.
func extractMentions(content string) []string {
	matches := mentionRegexp.FindAllStringSubmatch(content, -1)
	if len(matches) == 0 {
		return nil
	}
	seen := make(map[string]struct{}, len(matches))
	out := make([]string, 0, len(matches))
	for _, m := range matches {
		name := m[1]
		key := strings.ToLower(name)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, name)
	}
	return out
}

type Service struct {
	repo       *Repository
	anon       AnonAssigner
	notifier   Notifier
	botTrigger BotTrigger
	credits    CreditsAwarder
	filter       ContentFilter
	moderator    Moderator
	editWindow   EditWindowSource
	botOwnership BotOwnershipChecker
}

func NewService(repo *Repository, anon AnonAssigner) *Service {
	return &Service{repo: repo, anon: anon}
}

func (s *Service) SetNotifier(n Notifier)             { s.notifier = n }
func (s *Service) SetBotTrigger(b BotTrigger)         { s.botTrigger = b }
func (s *Service) SetCreditsAwarder(c CreditsAwarder) { s.credits = c }
func (s *Service) SetContentFilter(f ContentFilter)   { s.filter = f }
func (s *Service) SetModerator(m Moderator)           { s.moderator = m }
func (s *Service) SetEditWindow(e EditWindowSource)   { s.editWindow = e }
func (s *Service) SetBotOwnership(b BotOwnershipChecker) { s.botOwnership = b }

// canEdit decides whether actor (role + id) may edit an entity owned by
// ownerID that was created at createdAt. Admins / moderators with EditAny
// bypass the window entirely; owners fall back to PermEditOwn + a time
// check against the live site setting.
func (s *Service) canEdit(actorID int64, actorRole string, ownerID int64, createdAt time.Time, permOwn, permAny string) error {
	if rbac.HasPermission(actorRole, permAny) {
		return nil
	}
	if actorID == 0 || actorID != ownerID {
		return ErrEditForbidden
	}
	if !rbac.HasPermission(actorRole, permOwn) {
		return ErrEditForbidden
	}
	window := 0
	if s.editWindow != nil {
		window = s.editWindow.PostEditWindowMinutes()
	}
	if window <= 0 {
		return ErrEditWindowExpired
	}
	if time.Since(createdAt) > time.Duration(window)*time.Minute {
		return ErrEditWindowExpired
	}
	return nil
}

// UpdateTopicBody updates a topic's body after permission + window checks.
// Returns the updated topic so the handler can echo it back. Moderation and
// content filter are re-run on the new body.
func (s *Service) UpdateTopicBody(actorID int64, actorRole string, topicID int64, newBody string) (*Topic, error) {
	newBody = strings.TrimSpace(newBody)
	if utf8.RuneCountInString(newBody) < 1 {
		return nil, ErrInvalidContent
	}
	t, err := s.repo.TopicByID(topicID)
	if err != nil {
		return nil, err
	}
	if t == nil {
		return nil, ErrTopicNotFound
	}
	if err := s.canEdit(actorID, actorRole, t.UserID, t.CreatedAt, rbac.PermTopicEditOwn, rbac.PermTopicEditAny); err != nil {
		return nil, err
	}
	if s.filter != nil {
		if hits := s.filter.Check(newBody); len(hits) > 0 {
			for _, h := range hits {
				if h.Severity == "block" {
					return nil, ErrContentBlocked
				}
			}
		}
	}
	if s.moderator != nil {
		cat, _ := s.repo.CategoryByID(t.CategoryID)
		rules := ""
		if cat != nil {
			rules = cat.Rules
		}
		r := s.moderator.Check(actorID, "topic", newBody, rules)
		if r.Blocked {
			suggestion := ""
			if s.moderator != nil {
				suggestion = s.moderator.GenerateRewrite(newBody, r.Reason, rules)
			}
			return nil, &BlockedError{Reason: r.Reason, Suggestion: suggestion}
		}
	}
	now := time.Now()
	t.Body = newBody
	t.Excerpt = truncateRunes(newBody, 200)
	t.EditedAt = &now
	if err := s.repo.UpdateTopicBody(t.ID, newBody, t.Excerpt, now); err != nil {
		return nil, err
	}
	return t, nil
}

// UpdatePost updates a reply's content after permission + window checks.
func (s *Service) UpdatePost(actorID int64, actorRole string, postID int64, newContent string) (*Post, error) {
	newContent = strings.TrimSpace(newContent)
	if utf8.RuneCountInString(newContent) < 1 {
		return nil, ErrInvalidContent
	}
	p, err := s.repo.PostByID(postID)
	if err != nil {
		return nil, err
	}
	if p == nil {
		return nil, ErrPostNotFound
	}
	if err := s.canEdit(actorID, actorRole, p.UserID, p.CreatedAt, rbac.PermReplyEditOwn, rbac.PermReplyEditAny); err != nil {
		return nil, err
	}
	if s.filter != nil {
		if hits := s.filter.Check(newContent); len(hits) > 0 {
			for _, h := range hits {
				if h.Severity == "block" {
					return nil, ErrContentBlocked
				}
			}
		}
	}
	if s.moderator != nil {
		rules := ""
		if parent, err := s.repo.TopicByID(p.TopicID); err == nil && parent != nil {
			if cat, _ := s.repo.CategoryByID(parent.CategoryID); cat != nil {
				rules = cat.Rules
			}
		}
		r := s.moderator.Check(actorID, "post", newContent, rules)
		if r.Blocked {
			suggestion := ""
			if s.moderator != nil {
				suggestion = s.moderator.GenerateRewrite(newContent, r.Reason, rules)
			}
			return nil, &BlockedError{Reason: r.Reason, Suggestion: suggestion}
		}
	}
	now := time.Now()
	p.Content = newContent
	p.EditedAt = &now
	if err := s.repo.UpdatePostContent(p.ID, newContent, now); err != nil {
		return nil, err
	}
	return p, nil
}

// ---------- Categories ----------

func (s *Service) ListCategories() ([]Category, error) {
	return s.repo.ListCategories()
}

// CountTopics exposes the non-deleted topic total for the admin dashboard.
func (s *Service) CountTopics() (int64, error) {
	return s.repo.CountTopics()
}

func (s *Service) CategoryBySlug(slug string) (*Category, error) {
	c, err := s.repo.CategoryBySlug(slug)
	if err != nil {
		return nil, err
	}
	if c == nil {
		return nil, ErrCategoryNotFound
	}
	return c, nil
}

// ---------- Admin: category CRUD ----------

type CategoryInput struct {
	Name         string
	Slug         string
	Description  string
	Type         string
	PostCooldown int
	AllowBot     bool
	Rules        string
}

func validateCategoryInput(in *CategoryInput) error {
	in.Name = strings.TrimSpace(in.Name)
	in.Slug = strings.TrimSpace(strings.ToLower(in.Slug))
	in.Description = strings.TrimSpace(in.Description)
	in.Type = strings.TrimSpace(in.Type)
	in.Rules = strings.TrimSpace(in.Rules)
	nameLen := utf8.RuneCountInString(in.Name)
	if nameLen < 1 || nameLen > 64 {
		return ErrInvalidCategory
	}
	if l := len(in.Slug); l < 1 || l > 64 || !slugRegexp.MatchString(in.Slug) {
		return ErrInvalidCategory
	}
	if utf8.RuneCountInString(in.Description) > 512 {
		return ErrInvalidCategory
	}
	switch in.Type {
	case categoryTypeNormal, categoryTypeAnon, categoryTypeBot:
	default:
		return ErrInvalidCategory
	}
	if in.PostCooldown < 0 {
		in.PostCooldown = 0
	}
	return nil
}

func (s *Service) CreateCategory(in CategoryInput) (*Category, error) {
	if err := validateCategoryInput(&in); err != nil {
		return nil, err
	}
	if existing, err := s.repo.CategoryBySlug(in.Slug); err != nil {
		return nil, err
	} else if existing != nil {
		return nil, ErrCategorySlugTaken
	}
	maxOrder, err := s.repo.MaxCategorySortOrder()
	if err != nil {
		return nil, err
	}
	c := &Category{
		Name:         in.Name,
		Slug:         in.Slug,
		Description:  in.Description,
		Type:         in.Type,
		SortOrder:    maxOrder + 10,
		PostCooldown: in.PostCooldown,
		AllowBot:     in.AllowBot,
		Rules:        in.Rules,
	}
	if err := s.repo.CreateCategory(c); err != nil {
		return nil, err
	}
	return c, nil
}

func (s *Service) UpdateCategory(id int64, in CategoryInput) (*Category, error) {
	if err := validateCategoryInput(&in); err != nil {
		return nil, err
	}
	current, err := s.repo.CategoryByID(id)
	if err != nil {
		return nil, err
	}
	if current == nil {
		return nil, ErrCategoryNotFound
	}
	if in.Slug != current.Slug {
		if existing, err := s.repo.CategoryBySlug(in.Slug); err != nil {
			return nil, err
		} else if existing != nil {
			return nil, ErrCategorySlugTaken
		}
	}
	current.Name = in.Name
	current.Slug = in.Slug
	current.Description = in.Description
	current.Type = in.Type
	current.PostCooldown = in.PostCooldown
	current.AllowBot = in.AllowBot
	current.Rules = in.Rules
	if err := s.repo.UpdateCategory(current); err != nil {
		return nil, err
	}
	return current, nil
}

func (s *Service) DeleteCategory(id int64) error {
	current, err := s.repo.CategoryByID(id)
	if err != nil {
		return err
	}
	if current == nil {
		return ErrCategoryNotFound
	}
	if current.TopicCount > 0 {
		return ErrCategoryInUse
	}
	return s.repo.DeleteCategory(id)
}

// ---------- Admin: topic / post moderation ----------

func (s *Service) GetTopic(id int64) (*Topic, error) {
	return s.repo.TopicByID(id)
}

// GetPost is the public accessor used by admin code to resolve a post's
// author — e.g. when handling a report against a specific reply.
func (s *Service) GetPost(id int64) (*Post, error) {
	return s.repo.PostByID(id)
}

// FollowedTopics returns the activity feed for the given viewer — recent
// topics by users they follow. Goes through scrubBannedTopic so banned
// authors' content is hidden.
func (s *Service) FollowedTopics(viewerID int64, limit int) ([]Topic, error) {
	items, err := s.repo.FollowedTopics(viewerID, limit)
	if err != nil {
		return nil, err
	}
	for i := range items {
		scrubBannedTopic(&items[i])
	}
	return items, nil
}

// SearchTopics is the lightweight title search used by the bot skill API.
// Returns a small projection (id, title, slug) so bot replies stay compact.
type SearchHit struct {
	ID           int64  `json:"id"`
	Title        string `json:"title"`
	CategorySlug string `json:"category_slug,omitempty"`
	ReplyCount   int    `json:"reply_count"`
}

func (s *Service) SearchTopics(q string, limit int) ([]SearchHit, error) {
	items, err := s.repo.SearchTopics(q, limit)
	if err != nil {
		return nil, err
	}
	items, err = s.repo.fillCategorySlugs(items)
	if err != nil {
		return nil, err
	}
	out := make([]SearchHit, 0, len(items))
	for _, t := range items {
		out = append(out, SearchHit{
			ID:           t.ID,
			Title:        t.Title,
			CategorySlug: t.CategorySlug,
			ReplyCount:   t.ReplyCount,
		})
	}
	return out, nil
}

func (s *Service) SetTopicLocked(id int64, locked bool) (*Topic, error) {
	t, err := s.repo.TopicByID(id)
	if err != nil {
		return nil, err
	}
	if t == nil {
		return nil, ErrTopicNotFound
	}
	if err := s.repo.SetTopicLocked(id, locked); err != nil {
		return nil, err
	}
	t.IsLocked = locked
	return t, nil
}

func (s *Service) SetTopicPin(id int64, level int16, weight int) (*Topic, error) {
	if level < 0 || level > 3 {
		return nil, ErrInvalidPinLevel
	}
	t, err := s.repo.TopicByID(id)
	if err != nil {
		return nil, err
	}
	if t == nil {
		return nil, ErrTopicNotFound
	}
	if err := s.repo.SetTopicPin(id, level, weight); err != nil {
		return nil, err
	}
	t.PinLevel = level
	t.PinWeight = weight
	return t, nil
}

func (s *Service) SetTopicFeatured(id int64, featured bool) (*Topic, error) {
	t, err := s.repo.TopicByID(id)
	if err != nil {
		return nil, err
	}
	if t == nil {
		return nil, ErrTopicNotFound
	}
	if err := s.repo.SetTopicFeatured(id, featured); err != nil {
		return nil, err
	}
	t.IsFeatured = featured
	return t, nil
}

func (s *Service) DeleteTopic(id int64) (*Topic, error) {
	t, err := s.repo.TopicByID(id)
	if err != nil {
		return nil, err
	}
	if t == nil {
		return nil, ErrTopicNotFound
	}
	if err := s.repo.SoftDeleteTopic(id); err != nil {
		return nil, err
	}
	return t, nil
}

// ---------- Bot context (Phase 2) ----------

// BotTopicSnapshot mirrors bot.TopicSnapshot but lives in forum to keep the
// dep direction one-way (forum is depended on, not depending). main.go
// translates this shape to the bot package's via an adapter.
type BotTopicSnapshot struct {
	Title string
	Body  string
	Posts []BotPostSnapshot
}

type BotPostSnapshot struct {
	Floor   int
	Author  string
	Content string
	IsBot   bool
}

func (s *Service) LoadTopicForBot(topicID int64) (*BotTopicSnapshot, error) {
	t, err := s.repo.TopicByID(topicID)
	if err != nil {
		return nil, err
	}
	if t == nil {
		return nil, ErrTopicNotFound
	}
	posts, err := s.repo.PostsByTopic(topicID)
	if err != nil {
		return nil, err
	}
	out := &BotTopicSnapshot{Title: t.Title, Body: t.Body}
	for _, p := range posts {
		author := ""
		if p.IsAnon {
			author = p.AnonID
		} else if p.IsBotGenerated && p.Bot != nil {
			author = "@" + p.Bot.Slug
		} else if p.User != nil {
			author = p.User.Username
		}
		out.Posts = append(out.Posts, BotPostSnapshot{
			Floor:   p.Floor,
			Author:  author,
			Content: p.Content,
			IsBot:   p.IsBotGenerated,
		})
	}
	return out, nil
}

// PostBotReply inserts a bot-generated reply into the given topic. It bypasses
// the regular CreatePost path's notifier/trigger fan-out logic that would
// re-trigger the same bot.
func (s *Service) PostBotReply(topicID, botID, ownerUserID int64, content string) error {
	t, err := s.repo.TopicByID(topicID)
	if err != nil {
		return err
	}
	if t == nil {
		return ErrTopicNotFound
	}
	if t.IsLocked {
		return ErrTopicLocked
	}
	bid := botID
	p := &Post{
		TopicID:        topicID,
		UserID:         ownerUserID,
		Content:        content,
		IsBotGenerated: true,
		BotID:          &bid,
	}
	if err := s.repo.CreatePost(p); err != nil {
		return err
	}
	// Notify the topic owner that a bot replied (treat as a regular reply).
	if s.notifier != nil && t.UserID != 0 && t.UserID != ownerUserID {
		s.notifier.NotifyReply(
			t.UserID, ownerUserID, "", false,
			"topic", t.ID, t.Title, truncateRunes(content, 120),
			t.ID, p.Floor,
		)
	}
	return nil
}

func (s *Service) DeletePost(id int64) (*Post, error) {
	p, err := s.repo.PostByID(id)
	if err != nil {
		return nil, err
	}
	if p == nil {
		return nil, ErrTopicNotFound
	}
	if err := s.repo.SoftDeletePost(id); err != nil {
		return nil, err
	}
	return p, nil
}

// MoveCategory swaps sort_order with the previous (up) or next (down) category
// of the same type. Returns ErrCannotMove at the boundary.
func (s *Service) MoveCategory(id int64, direction string) error {
	current, err := s.repo.CategoryByID(id)
	if err != nil {
		return err
	}
	if current == nil {
		return ErrCategoryNotFound
	}
	siblings, err := s.repo.ListCategoriesByType(current.Type)
	if err != nil {
		return err
	}
	idx := -1
	for i, c := range siblings {
		if c.ID == id {
			idx = i
			break
		}
	}
	if idx == -1 {
		return ErrCategoryNotFound
	}
	var neighbor int
	switch direction {
	case "up":
		neighbor = idx - 1
	case "down":
		neighbor = idx + 1
	default:
		return ErrCannotMove
	}
	if neighbor < 0 || neighbor >= len(siblings) {
		return ErrCannotMove
	}
	return s.repo.SwapCategorySortOrder(current.ID, siblings[neighbor].ID)
}

// ---------- Topics ----------

func (s *Service) ListTopics(opts TopicListOptions) ([]Topic, error) {
	items, err := s.repo.ListTopics(opts)
	if err != nil {
		return nil, err
	}
	for i := range items {
		scrubAnonAuthor(&items[i])
		scrubBannedTopic(&items[i])
	}
	return items, nil
}

func (s *Service) TopicDetail(id int64) (*Topic, []Post, error) {
	t, err := s.repo.TopicByID(id)
	if err != nil {
		return nil, nil, err
	}
	if t == nil {
		return nil, nil, ErrTopicNotFound
	}
	scrubAnonAuthor(t)
	scrubBannedTopic(t)

	posts, err := s.repo.PostsByTopic(id)
	if err != nil {
		return nil, nil, err
	}
	for i := range posts {
		if posts[i].IsAnon {
			posts[i].User = nil
		}
		scrubBannedPost(&posts[i])
	}

	_ = s.repo.IncrementTopicView(id) // best-effort
	return t, posts, nil
}

// scrubAnonAuthor blanks the user field on anonymous topics before returning
// to API callers — anonymity must not leak even if GORM preloads the user.
func scrubAnonAuthor(t *Topic) {
	if t.IsAnon {
		t.User = nil
	}
}

// scrubBannedTopic clears body/excerpt of a non-anon topic whose author has
// been banned, so the placeholder is rendered server-side regardless of how
// the frontend handles it. Anonymous topics are never affected here — the
// anonymity layer already detached the user.
func scrubBannedTopic(t *Topic) {
	if t == nil || t.IsAnon || t.User == nil {
		return
	}
	if t.User.Status == "banned" {
		t.Body = ""
		t.Excerpt = ""
	}
}

func scrubBannedPost(p *Post) {
	if p == nil || p.IsAnon || p.User == nil {
		return
	}
	if p.User.Status == "banned" {
		p.Content = ""
	}
}

// truncateRunes returns at most max runes from s, preserving UTF-8 boundaries.
// Plain byte slicing (s[:max]) can cut a multi-byte codepoint in half and
// produce invalid UTF-8 that Postgres will reject.
func truncateRunes(s string, max int) string {
	if utf8.RuneCountInString(s) <= max {
		return s
	}
	runes := []rune(s)
	return string(runes[:max])
}

func (s *Service) ListTopicsByUserID(userID int64, limit int) ([]Topic, error) {
	return s.repo.ListTopicsByUserID(userID, limit)
}

func (s *Service) ListPostsByUserID(userID int64, limit int) ([]Post, error) {
	return s.repo.ListPostsByUserID(userID, limit)
}

func (s *Service) UserRefByUsername(username string) (*UserRef, error) {
	return s.repo.UserRefByUsername(username)
}

// ---------- Interactions ----------

func (s *Service) ToggleTopicLike(userID, topicID int64) (bool, int, error) {
	liked, count, err := s.repo.ToggleLike(userID, TargetTopic, topicID)
	if err != nil || !liked {
		return liked, count, err
	}
	t, _ := s.repo.TopicByID(topicID)
	if t != nil && t.UserID != 0 && t.UserID != userID && !t.IsAnon {
		if s.notifier != nil {
			actor, _ := s.repo.UserRefByID(userID)
			actorName := ""
			if actor != nil {
				actorName = actor.Username
			}
			s.notifier.NotifyLike(t.UserID, userID, actorName, "topic", t.ID, t.Title, t.ID, 0)
		}
		if s.credits != nil {
			s.credits.AwardLikeReceived(t.UserID, "topic", t.ID, userID, "主题被点赞")
		}
	}
	return liked, count, nil
}

func (s *Service) TogglePostLike(userID, postID int64) (bool, int, error) {
	liked, count, err := s.repo.ToggleLike(userID, TargetPost, postID)
	if err != nil || !liked {
		return liked, count, err
	}
	p, _ := s.repo.PostByID(postID)
	if p != nil && p.UserID != 0 && p.UserID != userID && !p.IsAnon {
		title := ""
		if t, _ := s.repo.TopicByID(p.TopicID); t != nil {
			title = t.Title
		}
		if s.notifier != nil {
			actor, _ := s.repo.UserRefByID(userID)
			actorName := ""
			if actor != nil {
				actorName = actor.Username
			}
			s.notifier.NotifyLike(p.UserID, userID, actorName, "post", p.ID, title, p.TopicID, p.Floor)
		}
		if s.credits != nil {
			s.credits.AwardLikeReceived(p.UserID, "post", p.ID, userID, "回帖被点赞")
		}
	}
	return liked, count, nil
}

func (s *Service) ToggleBookmark(userID, topicID int64) (bool, error) {
	return s.repo.ToggleBookmark(userID, topicID)
}

// HydrateTopicUserState fills UserLiked / UserBookmarked on a single topic.
// No-op for anonymous callers (userID == 0).
func (s *Service) HydrateTopicUserState(userID int64, t *Topic) error {
	if userID == 0 || t == nil {
		return nil
	}
	liked, err := s.repo.LikedTargets(userID, TargetTopic, []int64{t.ID})
	if err != nil {
		return err
	}
	t.UserLiked = liked[t.ID]
	bm, err := s.repo.IsBookmarked(userID, t.ID)
	if err != nil {
		return err
	}
	t.UserBookmarked = bm
	return nil
}

// HydrateTopicsUserState fills UserLiked on a list of topics in one query.
func (s *Service) HydrateTopicsUserState(userID int64, topics []Topic) error {
	if userID == 0 || len(topics) == 0 {
		return nil
	}
	ids := make([]int64, len(topics))
	for i := range topics {
		ids[i] = topics[i].ID
	}
	liked, err := s.repo.LikedTargets(userID, TargetTopic, ids)
	if err != nil {
		return err
	}
	for i := range topics {
		if liked[topics[i].ID] {
			topics[i].UserLiked = true
		}
	}
	return nil
}

// HydratePostsUserState fills UserLiked on a list of posts in one query.
func (s *Service) HydratePostsUserState(userID int64, posts []Post) error {
	if userID == 0 || len(posts) == 0 {
		return nil
	}
	ids := make([]int64, len(posts))
	for i := range posts {
		ids[i] = posts[i].ID
	}
	liked, err := s.repo.LikedTargets(userID, TargetPost, ids)
	if err != nil {
		return err
	}
	for i := range posts {
		if liked[posts[i].ID] {
			posts[i].UserLiked = true
		}
	}
	return nil
}

type CreateTopicInput struct {
	UserID       int64
	CategorySlug string
	Title        string
	Body         string
	IsAnon       bool
	MinReadLevel int16
}

func (s *Service) CreateTopic(in CreateTopicInput) (*Topic, error) {
	title := strings.TrimSpace(in.Title)
	titleChars := utf8.RuneCountInString(title)
	if titleChars < 2 || titleChars > 200 {
		return nil, ErrInvalidTitle
	}
	body := strings.TrimSpace(in.Body)
	if utf8.RuneCountInString(body) < 2 {
		return nil, ErrInvalidContent
	}

	// Read-level gate: the author can only restrict a topic up to their
	// own level. A sub-L3 user cannot make an L5-only topic and hide it
	// from everyone including themselves.
	if in.MinReadLevel < 0 {
		return nil, ErrInvalidReadLevel
	}
	if in.MinReadLevel > 0 {
		author, err := s.repo.UserRefByID(in.UserID)
		if err != nil {
			return nil, err
		}
		if author == nil || in.MinReadLevel > author.Level {
			return nil, ErrInvalidReadLevel
		}
	}

	// Dedup: block a rapid double-submit (typically caused by a frantic
	// double-click before the button disabled). Matches the same author
	// posting identical title + body within a short window.
	if dup, _ := s.repo.RecentDuplicateTopic(in.UserID, title, body, duplicateWindow); dup {
		return nil, ErrDuplicateSubmission
	}

	if s.filter != nil {
		hits := s.filter.Check(title + "\n" + body)
		for _, h := range hits {
			if h.Severity == "block" {
				return nil, ErrContentBlocked
			}
		}
	}

	c, err := s.CategoryBySlug(in.CategorySlug)
	if err != nil {
		return nil, err
	}

	// Bot-type categories require the author to own at least one active
	// bot. The rule: you're allowed to publish here only if you have skin
	// in the game as a bot builder. Regular commentary still works — you
	// can reply to existing threads without owning a bot.
	if c.Type == categoryTypeBot {
		if s.botOwnership == nil {
			return nil, ErrBotRequired
		}
		owns, err := s.botOwnership.HasActiveBot(in.UserID)
		if err != nil {
			return nil, err
		}
		if !owns {
			return nil, ErrBotRequired
		}
	}

	excerpt := truncateRunes(body, 256)

	// Anon boards always force anon. Non-anon boards (normal / bot) reject
	// the anon flag outright — anonymity is a board-level property, not a
	// per-post opt-in. This keeps the audit model simple: if a topic is
	// anonymous, its category is anonymous.
	isAnon := c.Type == "anon"

	t := &Topic{
		CategoryID:   c.ID,
		UserID:       in.UserID,
		Title:        title,
		Body:         body,
		Excerpt:      excerpt,
		IsAnon:       isAnon,
		MinReadLevel: in.MinReadLevel,
	}
	if err := s.repo.CreateTopic(t); err != nil {
		return nil, err
	}

	if isAnon && s.anon != nil {
		if id, err := s.anon.Assign(t.ID, in.UserID, 0); err == nil {
			t.TopicAnonID = id
			_ = s.repo.UpdateTopicAnonID(t.ID, id)
		}
	}

	s.fanoutMentions(t.UserID, in.UserID, isAnon, t.TopicAnonID, body, "topic", t.ID, t.Title, t.ID, 0)

	if s.botTrigger != nil && !isAnon {
		s.botTrigger.AsyncTrigger(t.ID, 0, in.UserID, t.Title+"\n\n"+body)
	}

	if s.credits != nil && in.UserID != 0 {
		minLen := s.credits.MinTopicLength()
		if utf8.RuneCountInString(body) >= minLen {
			s.credits.Award(in.UserID, "topic_reward", "topic", t.ID, "发布主题奖励")
		}
	}

	// Kick off LLM moderation in the background so the user's POST
	// returns in milliseconds instead of 3-15s. If the model later
	// flags the content, asyncModerateTopic soft-deletes the topic
	// and notifies the author. The cheap sync filter above already
	// blocked the obvious stuff synchronously.
	if s.moderator != nil {
		go s.asyncModerateTopic(t.ID, t.UserID, t.Title, t.Body, c.Rules)
	}

	return t, nil
}

// asyncModerateTopic runs the LLM moderator check after CreateTopic
// returns. It recovers from any panic so a buggy moderator can't take
// down the server, and records the outcome to the moderation log. On
// block, the topic is soft-deleted and the author is notified — the
// suggestion-rewrite flow available in sync mode is dropped because
// the HTTP response has already left the building.
func (s *Service) asyncModerateTopic(topicID, authorID int64, title, body, rules string) {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("async topic moderation panic: topic=%d err=%v", topicID, r)
		}
	}()
	result := s.moderator.Check(authorID, "topic", title+"\n\n"+body, rules)
	if result.LogID > 0 {
		s.moderator.LinkTarget(result.LogID, topicID)
	}
	if !result.Blocked {
		return
	}
	if err := s.repo.SoftDeleteTopic(topicID); err != nil {
		log.Printf("async topic moderation: soft-delete topic=%d failed: %v", topicID, err)
		return
	}
	if s.notifier != nil && authorID != 0 {
		s.notifier.NotifyModerationHidden(authorID, "topic", topicID, title, result.Reason, topicID, 0)
	}
}

// fanoutMentions resolves @username tokens in content and pushes a mention
// notification to each unique recipient. Self-mentions and mentions of the
// thread author (already covered by reply notifications) are skipped.
func (s *Service) fanoutMentions(
	threadOwnerID, actorID int64,
	actorIsAnon bool,
	actorAnonID string,
	content string,
	targetType string, targetID int64, targetTitle string,
	topicID int64, postFloor int,
) {
	if s.notifier == nil {
		return
	}
	names := extractMentions(content)
	if len(names) == 0 {
		return
	}
	actorName := ""
	if !actorIsAnon {
		if u, err := s.repo.UserRefByID(actorID); err == nil && u != nil {
			actorName = u.Username
		}
	} else {
		actorName = actorAnonID
	}
	preview := truncateRunes(content, 120)
	seen := make(map[int64]struct{})
	for _, name := range names {
		u, err := s.repo.UserRefByUsername(name)
		if err != nil || u == nil {
			continue
		}
		if u.ID == actorID || u.ID == threadOwnerID {
			continue
		}
		if _, ok := seen[u.ID]; ok {
			continue
		}
		seen[u.ID] = struct{}{}
		s.notifier.NotifyMention(
			u.ID, actorID, actorName, actorIsAnon,
			targetType, targetID, targetTitle, preview,
			topicID, postFloor,
		)
	}
}

// ---------- Posts ----------

func (s *Service) PostsByTopic(topicID int64) ([]Post, error) {
	return s.repo.PostsByTopic(topicID)
}

type CreatePostInput struct {
	TopicID      int64
	UserID       int64
	Content      string
	ReplyToFloor *int
}

func (s *Service) CreatePost(in CreatePostInput) (*Post, error) {
	content := strings.TrimSpace(in.Content)
	if utf8.RuneCountInString(content) < 1 {
		return nil, ErrInvalidContent
	}

	// Dedup: block a rapid double-submit from the same author in the same
	// topic with identical content. Guards against double-click mis-fires
	// and racey network retries.
	if dup, _ := s.repo.RecentDuplicatePost(in.UserID, in.TopicID, content, duplicateWindow); dup {
		return nil, ErrDuplicateSubmission
	}

	if s.filter != nil {
		hits := s.filter.Check(content)
		for _, h := range hits {
			if h.Severity == "block" {
				return nil, ErrContentBlocked
			}
		}
	}

	t, err := s.repo.TopicByID(in.TopicID)
	if err != nil {
		return nil, err
	}
	if t == nil {
		return nil, ErrTopicNotFound
	}

	if t.IsLocked {
		return nil, ErrTopicLocked
	}

	p := &Post{
		TopicID:      in.TopicID,
		UserID:       in.UserID,
		Content:      content,
		IsAnon:       t.IsAnon,
		ReplyToFloor: in.ReplyToFloor,
	}
	if err := s.repo.CreatePost(p); err != nil {
		return nil, err
	}

	if p.IsAnon && s.anon != nil {
		if id, err := s.anon.Assign(p.TopicID, in.UserID, p.ID); err == nil {
			p.AnonID = id
			_ = s.repo.UpdatePostAnonID(p.ID, id)
		}
	}

	if s.notifier != nil {
		actorName := ""
		if !p.IsAnon {
			if u, err := s.repo.UserRefByID(in.UserID); err == nil && u != nil {
				actorName = u.Username
			}
		} else {
			actorName = p.AnonID
		}
		preview := truncateRunes(content, 120)

		// Notify the topic owner of a new reply. Route them to the new
		// reply's floor rather than the top of the thread — keeps the
		// "jump to the thing that just happened" invariant consistent
		// across reply / like / mention notifications.
		if t.UserID != 0 && t.UserID != in.UserID {
			s.notifier.NotifyReply(
				t.UserID, in.UserID, actorName, p.IsAnon,
				"topic", t.ID, t.Title, preview,
				t.ID, p.Floor,
			)
		}

		// Notify the floor owner if this post is a reply to a specific floor.
		if in.ReplyToFloor != nil && *in.ReplyToFloor > 0 {
			if parent, err := s.repo.PostByTopicAndFloor(t.ID, *in.ReplyToFloor); err == nil && parent != nil {
				if parent.UserID != 0 && parent.UserID != in.UserID && parent.UserID != t.UserID {
					s.notifier.NotifyReply(
						parent.UserID, in.UserID, actorName, p.IsAnon,
						"post", p.ID, t.Title, preview,
						t.ID, p.Floor,
					)
				}
			}
		}
	}

	s.fanoutMentions(t.UserID, in.UserID, p.IsAnon, p.AnonID, content, "post", p.ID, t.Title, t.ID, p.Floor)

	// Bot trigger: scan @botslug mentions and dispatch async LLM call. Skip
	// bot-generated posts to avoid feedback loops, and skip anon boards (bots
	// are not allowed in the anon region).
	if s.botTrigger != nil && !p.IsBotGenerated && !p.IsAnon {
		s.botTrigger.AsyncTrigger(t.ID, p.ID, in.UserID, content)
	}

	if s.credits != nil && in.UserID != 0 && !p.IsBotGenerated {
		minLen := s.credits.MinPostLength()
		if utf8.RuneCountInString(content) >= minLen {
			s.credits.Award(in.UserID, "post_reward", "post", p.ID, "发布回帖奖励")
		}
	}

	// Async LLM moderation — same pattern as CreateTopic. Filter already
	// ran sync above; this is the slow content audit path.
	if s.moderator != nil && !p.IsBotGenerated {
		cat, _ := s.repo.CategoryByID(t.CategoryID)
		rules := ""
		if cat != nil {
			rules = cat.Rules
		}
		go s.asyncModeratePost(p.ID, t.ID, p.Floor, in.UserID, content, t.Title, rules)
	}

	return p, nil
}

// asyncModeratePost is the reply-side twin of asyncModerateTopic.
// topicID + postFloor are threaded through so the moderation-hidden
// notification routes to the exact floor, same as every other
// post-scoped notification.
func (s *Service) asyncModeratePost(postID, topicID int64, postFloor int, authorID int64, content, topicTitle, rules string) {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("async post moderation panic: post=%d err=%v", postID, r)
		}
	}()
	result := s.moderator.Check(authorID, "post", content, rules)
	if result.LogID > 0 {
		s.moderator.LinkTarget(result.LogID, postID)
	}
	if !result.Blocked {
		return
	}
	if err := s.repo.SoftDeletePost(postID); err != nil {
		log.Printf("async post moderation: soft-delete post=%d failed: %v", postID, err)
		return
	}
	if s.notifier != nil && authorID != 0 {
		s.notifier.NotifyModerationHidden(authorID, "post", postID, topicTitle, result.Reason, topicID, postFloor)
	}
}
