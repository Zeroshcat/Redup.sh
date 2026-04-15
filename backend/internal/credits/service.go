package credits

import "log"

// ConfigSource lets the credits service read live admin-tunable rules from
// site_settings without importing the site package directly.
type ConfigSource interface {
	GetCredits() (Config, error)
}

// Config mirrors site.Credits — duplicated here so the credits package stays
// dep-free. main.go provides an adapter that converts site.Credits to this.
type Config struct {
	SignupBonus           Reward
	TopicReward           Reward
	PostReward            Reward
	LikeXPReward          int
	ViolationPenalty      int
	DailyTopicCap         int
	DailyPostCap          int
	DailyLikeXPCap        int
	MinTopicLength        int
	MinPostLength         int
	LevelThresholds       []int
	DailyFreeTranslations int
	TranslationCost       int
	TranslationProvider   string
	TranslationModel      string
}

type Reward struct {
	XP      int
	Credits int
}

type Service struct {
	repo *Repository
	cfg  ConfigSource
}

func NewService(repo *Repository, cfg ConfigSource) *Service {
	return &Service{repo: repo, cfg: cfg}
}

func (s *Service) config() Config {
	if s.cfg == nil {
		return Config{}
	}
	c, err := s.cfg.GetCredits()
	if err != nil {
		log.Printf("credits: failed to load config: %v", err)
		return Config{}
	}
	return c
}

// LevelForXP returns the user-facing level (1-indexed) for the given XP.
// Reads thresholds from the live config so the curve can be retuned without
// rebuilding.
func (s *Service) LevelForXP(xp int) int {
	thresholds := s.config().LevelThresholds
	if len(thresholds) == 0 {
		return 1
	}
	level := 1
	for i, t := range thresholds {
		if xp >= t {
			level = i + 1
		} else {
			break
		}
	}
	return level
}

// NextLevelInfo returns the current level + the XP threshold for the next
// level. If the user is at the top level, NextLevel == 0 and NextThreshold
// equals the current threshold.
type LevelInfo struct {
	Level             int `json:"level"`
	NextLevel         int `json:"next_level"`
	CurrentThreshold  int `json:"current_threshold"`
	NextThreshold     int `json:"next_threshold"`
	XPIntoLevel       int `json:"xp_into_level"`
	XPNeededForNext   int `json:"xp_needed_for_next"`
}

func (s *Service) LevelInfoForXP(xp int) LevelInfo {
	thresholds := s.config().LevelThresholds
	if len(thresholds) == 0 {
		return LevelInfo{Level: 1}
	}
	level := s.LevelForXP(xp)
	out := LevelInfo{Level: level, CurrentThreshold: thresholds[level-1]}
	if level < len(thresholds) {
		out.NextLevel = level + 1
		out.NextThreshold = thresholds[level]
		out.XPIntoLevel = xp - out.CurrentThreshold
		out.XPNeededForNext = out.NextThreshold - xp
	} else {
		// At max level — return current threshold for both.
		out.NextThreshold = out.CurrentThreshold
	}
	return out
}

// Award is the positive-direction entry point. Reads the configured Reward
// bundle for the named action, enforces the daily cap for that kind, and
// posts a transaction. Best-effort: failures are logged, never returned.
func (s *Service) Award(userID int64, kind string, refType string, refID int64, note string) {
	if userID == 0 || kind == "" {
		return
	}
	c := s.config()
	r := s.rewardFor(kind, c)
	if r.XP == 0 && r.Credits == 0 {
		return
	}
	if cap := s.dailyCapFor(kind, c); cap > 0 {
		count, err := s.repo.CountToday(userID, kind)
		if err != nil {
			log.Printf("credits: cap check failed for %s: %v", kind, err)
			return
		}
		if count >= int64(cap) {
			return // cap reached for today; silently skip the reward
		}
	}
	if _, err := s.repo.Apply(userID, r.XP, r.Credits, true, kind, refType, refID, note); err != nil {
		log.Printf("credits: award %s to user %d failed: %v", kind, userID, err)
	}
}

// AwardLikeReceived is a specialized entry point for like XP — it dedupes by
// (recipient, ref, actor) so re-toggling a like never yields more than one
// XP per (post, liker) pair, and it honors the daily like cap.
func (s *Service) AwardLikeReceived(recipientID int64, refType string, refID, actorID int64, note string) {
	if recipientID == 0 || actorID == 0 || recipientID == actorID {
		return
	}
	c := s.config()
	if c.LikeXPReward <= 0 {
		return
	}
	already, err := s.repo.LikeAlreadyAwarded(recipientID, KindLikeReceived, refType, refID, actorID)
	if err != nil {
		log.Printf("credits: like dedupe check failed: %v", err)
		return
	}
	if already {
		return
	}
	if cap := c.DailyLikeXPCap; cap > 0 {
		count, err := s.repo.CountToday(recipientID, KindLikeReceived)
		if err != nil {
			return
		}
		if count >= int64(cap) {
			return
		}
	}
	if _, err := s.repo.ApplyWithActor(recipientID, c.LikeXPReward, 0, true, KindLikeReceived, refType, refID, actorID, note); err != nil {
		log.Printf("credits: award like_received failed: %v", err)
	}
}

func (s *Service) rewardFor(kind string, c Config) Reward {
	switch kind {
	case KindSignupBonus:
		return c.SignupBonus
	case KindTopicReward:
		return c.TopicReward
	case KindPostReward:
		return c.PostReward
	case KindLikeReceived:
		return Reward{XP: c.LikeXPReward}
	}
	return Reward{}
}

func (s *Service) dailyCapFor(kind string, c Config) int {
	switch kind {
	case KindTopicReward:
		return c.DailyTopicCap
	case KindPostReward:
		return c.DailyPostCap
	case KindLikeReceived:
		return c.DailyLikeXPCap
	}
	return 0
}

// MinTopicLength / MinPostLength are exposed so forum.Service can decide
// whether to even call Award (skipping XP without disturbing the action).
func (s *Service) MinTopicLength() int { return s.config().MinTopicLength }
func (s *Service) MinPostLength() int  { return s.config().MinPostLength }

// Penalize applies the configured violation penalty to the given user.
// Allows negative balances so a heavily-violating user doesn't escape debt.
func (s *Service) Penalize(userID int64, refType string, refID int64, note string) {
	if userID == 0 {
		return
	}
	c := s.config()
	if c.ViolationPenalty <= 0 {
		return
	}
	if _, err := s.repo.Apply(userID, 0, -c.ViolationPenalty, true, KindViolationPenalty, refType, refID, note); err != nil {
		log.Printf("credits: penalize user %d failed: %v", userID, err)
	}
}

// Charge is for explicit consumption (e.g. translation). Returns ErrInsufficient
// when the user can't afford it. Caller must NOT hide the error from the user
// — they need to know why the action failed.
//
// Pass a negative amount to refund (allowed to put balance above any prior
// max — refunds skip the insufficient-balance check).
func (s *Service) Charge(userID int64, amount int, kind, refType string, refID int64, note string) (Wallet, error) {
	if amount == 0 {
		return s.repo.Balance(userID)
	}
	allowNegative := amount < 0 // refunds always succeed
	return s.repo.Apply(userID, 0, -amount, allowNegative, kind, refType, refID, note)
}

// RecordFreeUse writes a zero-delta transaction so the daily counter for
// the given kind reflects the consumption even though no credits changed
// hands. Used by features that have a free quota (e.g. translation).
func (s *Service) RecordFreeUse(userID int64, kind, refType string, refID int64, note string) error {
	if userID == 0 || kind == "" {
		return nil
	}
	_, err := s.repo.Apply(userID, 0, 0, true, kind, refType, refID, note)
	return err
}

// CountToday is exposed so other services (translation, etc.) can check daily
// usage of a given kind without re-implementing the date math.
func (s *Service) CountToday(userID int64, kind string) (int64, error) {
	return s.repo.CountToday(userID, kind)
}

func (s *Service) Balance(userID int64) (Wallet, error) {
	return s.repo.Balance(userID)
}

func (s *Service) History(userID int64, limit int) ([]Transaction, error) {
	return s.repo.History(userID, limit)
}

// Public is the typed shape returned by /api/users/me/wallet.
type Public struct {
	Wallet
	LevelInfo LevelInfo `json:"level_info"`
}

func (s *Service) BalanceWithLevel(userID int64) (Public, error) {
	w, err := s.repo.Balance(userID)
	if err != nil {
		return Public{}, err
	}
	return Public{Wallet: w, LevelInfo: s.LevelInfoForXP(w.XP)}, nil
}

// ---------- Admin surface ----------

// ListTransactions exposes the global ledger view for the admin panel.
func (s *Service) ListTransactions(opts ListOptions) ([]Transaction, int64, error) {
	return s.repo.ListTransactions(opts)
}

// StatsByKind returns the per-kind aggregate for the admin dashboard.
func (s *Service) StatsByKind() ([]KindStat, error) {
	return s.repo.StatsByKind()
}

// AdminAdjust writes a hand-authored wallet adjustment. Allows negative
// balances — admins need to be able to confiscate credits from a bad actor
// even if that puts them underwater, and refunds need to be possible at
// any time. Every adjustment is stamped with KindAdminAdjust and the
// acting admin's user id so the audit trail shows "who did what to whom".
func (s *Service) AdminAdjust(adminID, targetUserID int64, xpDelta, creditsDelta int, note string) (Wallet, error) {
	if targetUserID == 0 {
		return Wallet{}, ErrInsufficient // reuse — 0-user is as bad as insufficient
	}
	return s.repo.ApplyWithActor(
		targetUserID,
		xpDelta,
		creditsDelta,
		true, // allowNegative — admin authority overrides the guard
		KindAdminAdjust,
		"user", targetUserID,
		adminID,
		note,
	)
}
