package credits

import "time"

// Transaction is an append-only ledger entry. Every credit/XP movement writes
// one row so admins and users can audit the full history.
type Transaction struct {
	ID            int64     `gorm:"primaryKey" json:"id"`
	UserID        int64     `gorm:"index;not null" json:"user_id"`
	Kind          string    `gorm:"size:32;not null;index" json:"kind"`
	XPDelta       int       `json:"xp_delta"`
	CreditsDelta  int       `json:"credits_delta"`
	BalanceAfter  int       `json:"balance_after"`
	XPAfter       int       `json:"xp_after"`
	RefType       string    `gorm:"size:32" json:"ref_type,omitempty"`
	RefID         int64     `json:"ref_id,omitempty"`
	// ActorUserID identifies the third party that triggered an inbound award
	// (e.g. the user who liked your post). Used to dedupe like_received so a
	// single (post, liker) pair only awards XP once even after un/re-like.
	ActorUserID int64     `gorm:"index" json:"actor_user_id,omitempty"`
	Note        string    `gorm:"size:256" json:"note,omitempty"`
	CreatedAt   time.Time `gorm:"autoCreateTime;index" json:"created_at"`
}

func (Transaction) TableName() string { return "credit_transactions" }

// Built-in transaction kinds. Producers use these constants so the admin
// history filter can group them.
const (
	KindSignupBonus      = "signup_bonus"
	KindTopicReward      = "topic_reward"
	KindPostReward       = "post_reward"
	KindLikeReceived     = "like_received"
	KindViolationPenalty = "violation_penalty"
	KindTranslation      = "translation"
	KindAdminAdjust      = "admin_adjust"
)
