package credits

import (
	"errors"
	"time"

	"gorm.io/gorm"
)

var ErrInsufficient = errors.New("insufficient credits")

// userColumns is the minimal projection of the user wallet fields. Defined
// here as a struct (rather than importing user.User) to keep the dep direction
// one-way: credits → user is fine via raw SQL columns.
type Wallet struct {
	UserID  int64 `json:"user_id"`
	Credits int   `json:"credits"`
	XP      int   `json:"xp"`
}

type Repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

func (r *Repository) Balance(userID int64) (Wallet, error) {
	var w Wallet
	err := r.db.Table("users").
		Select("id AS user_id, credits, xp").
		Where("id = ?", userID).
		Take(&w).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return Wallet{}, nil
	}
	return w, err
}

// Apply atomically updates the user wallet with the given deltas and writes a
// transaction row. If allowNegative is false and the resulting balance would
// be negative, returns ErrInsufficient and leaves no side effect.
func (r *Repository) Apply(userID int64, xpDelta, creditsDelta int, allowNegative bool, kind, refType string, refID int64, note string) (Wallet, error) {
	var out Wallet
	err := r.db.Transaction(func(tx *gorm.DB) error {
		var w Wallet
		if err := tx.Table("users").
			Select("id AS user_id, credits, xp").
			Where("id = ?", userID).
			Take(&w).Error; err != nil {
			return err
		}
		newCredits := w.Credits + creditsDelta
		newXP := w.XP + xpDelta
		if newCredits < 0 && !allowNegative {
			return ErrInsufficient
		}
		if newXP < 0 {
			newXP = 0 // XP never drops below zero
		}
		if err := tx.Table("users").Where("id = ?", userID).Updates(map[string]interface{}{
			"credits": newCredits,
			"xp":      newXP,
		}).Error; err != nil {
			return err
		}
		row := &Transaction{
			UserID:       userID,
			Kind:         kind,
			XPDelta:      xpDelta,
			CreditsDelta: creditsDelta,
			BalanceAfter: newCredits,
			XPAfter:      newXP,
			RefType:      refType,
			RefID:        refID,
			Note:         note,
		}
		if err := tx.Create(row).Error; err != nil {
			return err
		}
		out = Wallet{UserID: userID, Credits: newCredits, XP: newXP}
		return nil
	})
	return out, err
}

// CountToday returns how many transactions of the given kind a user has
// received today (server local day). Used for daily caps.
func (r *Repository) CountToday(userID int64, kind string) (int64, error) {
	now := time.Now()
	startOfDay := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	var n int64
	err := r.db.Model(&Transaction{}).
		Where("user_id = ? AND kind = ? AND created_at >= ?", userID, kind, startOfDay).
		Count(&n).Error
	return n, err
}

// LikeAlreadyAwarded checks whether (recipientUserID, kind, refType, refID, actorUserID)
// already produced a transaction. Used to dedupe like_received so the same
// (post, liker) pair only triggers XP once across un/re-like cycles.
func (r *Repository) LikeAlreadyAwarded(recipientID int64, kind, refType string, refID, actorID int64) (bool, error) {
	var n int64
	err := r.db.Model(&Transaction{}).
		Where("user_id = ? AND kind = ? AND ref_type = ? AND ref_id = ? AND actor_user_id = ?",
			recipientID, kind, refType, refID, actorID).
		Count(&n).Error
	return n > 0, err
}

// ApplyWithActor is Apply with an additional actor_user_id snapshot — used
// when we need to dedupe by (recipient, ref, actor).
func (r *Repository) ApplyWithActor(userID int64, xpDelta, creditsDelta int, allowNegative bool, kind, refType string, refID, actorID int64, note string) (Wallet, error) {
	var out Wallet
	err := r.db.Transaction(func(tx *gorm.DB) error {
		var w Wallet
		if err := tx.Table("users").
			Select("id AS user_id, credits, xp").
			Where("id = ?", userID).
			Take(&w).Error; err != nil {
			return err
		}
		newCredits := w.Credits + creditsDelta
		newXP := w.XP + xpDelta
		if newCredits < 0 && !allowNegative {
			return ErrInsufficient
		}
		if newXP < 0 {
			newXP = 0
		}
		if err := tx.Table("users").Where("id = ?", userID).Updates(map[string]interface{}{
			"credits": newCredits,
			"xp":      newXP,
		}).Error; err != nil {
			return err
		}
		row := &Transaction{
			UserID:       userID,
			Kind:         kind,
			XPDelta:      xpDelta,
			CreditsDelta: creditsDelta,
			BalanceAfter: newCredits,
			XPAfter:      newXP,
			RefType:      refType,
			RefID:        refID,
			ActorUserID:  actorID,
			Note:         note,
		}
		if err := tx.Create(row).Error; err != nil {
			return err
		}
		out = Wallet{UserID: userID, Credits: newCredits, XP: newXP}
		return nil
	})
	return out, err
}

func (r *Repository) History(userID int64, limit int) ([]Transaction, error) {
	if limit <= 0 {
		limit = 100
	}
	var items []Transaction
	err := r.db.Where("user_id = ?", userID).
		Order("created_at DESC").
		Limit(limit).
		Find(&items).Error
	return items, err
}

// ListOptions drives the admin transaction browser. All filters are
// optional — an empty struct returns the most recent transactions across
// all users.
type ListOptions struct {
	UserID int64
	Kind   string
	Limit  int
	Offset int
}

// ListTransactions returns the global ledger view with the most recent
// transactions first. Total is the pre-limit row count so the UI can render
// paging. Caller-facing limit is capped at 500 to protect Postgres from a
// runaway scan if an admin pastes a huge value into the query string.
func (r *Repository) ListTransactions(opts ListOptions) ([]Transaction, int64, error) {
	q := r.db.Model(&Transaction{})
	if opts.UserID > 0 {
		q = q.Where("user_id = ?", opts.UserID)
	}
	if opts.Kind != "" {
		q = q.Where("kind = ?", opts.Kind)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	if opts.Limit <= 0 || opts.Limit > 500 {
		opts.Limit = 100
	}
	q = q.Order("created_at DESC").Limit(opts.Limit).Offset(opts.Offset)
	var items []Transaction
	if err := q.Find(&items).Error; err != nil {
		return nil, 0, err
	}
	return items, total, nil
}

// KindStat is one row of the aggregate ledger view. Counts are all-time;
// for recent trends the caller can add a date filter to ListTransactions.
type KindStat struct {
	Kind         string `json:"kind"`
	Count        int64  `json:"count"`
	XPDelta      int64  `json:"xp_delta"`
	CreditsDelta int64  `json:"credits_delta"`
}

// StatsByKind aggregates every transaction row into a per-kind summary.
// Useful for the admin credits dashboard headline: "how many likes awarded
// this week, how much XP went to signup bonuses, etc."
func (r *Repository) StatsByKind() ([]KindStat, error) {
	var out []KindStat
	err := r.db.Model(&Transaction{}).
		Select("kind, COUNT(*) AS count, COALESCE(SUM(xp_delta), 0) AS xp_delta, COALESCE(SUM(credits_delta), 0) AS credits_delta").
		Group("kind").
		Order("count DESC").
		Scan(&out).Error
	return out, err
}
