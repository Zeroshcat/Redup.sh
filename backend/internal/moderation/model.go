package moderation

import "time"

// Log is an append-only record of every LLM moderation call. Captures the
// verdict, the model's reasoning, and enough context (target, actor, content
// hash) for admins to investigate after the fact.
type Log struct {
	ID             int64     `gorm:"primaryKey" json:"id"`
	TargetType     string    `gorm:"size:16;index" json:"target_type"`
	TargetID       int64     `gorm:"index" json:"target_id,omitempty"` // populated after forum commit
	ContentHash    string    `gorm:"size:64;index" json:"content_hash"`
	ContentExcerpt string    `gorm:"size:512" json:"content_excerpt"`
	Verdict        string    `gorm:"size:16;not null;index" json:"verdict"`
	Reason         string    `gorm:"size:512" json:"reason,omitempty"`
	Provider       string    `gorm:"size:32" json:"provider"`
	Model          string    `gorm:"size:64" json:"model"`
	LatencyMs      int       `json:"latency_ms"`
	ActorUserID    int64     `gorm:"index" json:"actor_user_id"`
	ActorUsername  string    `gorm:"size:64" json:"actor_username,omitempty"`
	BlockedAction  bool      `json:"blocked_action"`
	Resolved       bool      `gorm:"default:false;index" json:"resolved"`
	CreatedAt      time.Time `gorm:"autoCreateTime;index" json:"created_at"`
}

func (Log) TableName() string { return "moderation_logs" }

// Verdict tiers returned by the LLM judge. The model is instructed to
// produce exactly one of these.
const (
	VerdictPass  = "pass"
	VerdictWarn  = "warn"
	VerdictBlock = "block"
)
