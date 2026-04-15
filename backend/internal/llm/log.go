package llm

import "time"

// CallLog captures a single Router.Complete invocation so admins can see
// which platform features are burning budget. Token counts are not
// available from every provider, so we store character lengths as a proxy —
// callers who care about real cost attribution can layer their own pricing
// logic on top of (provider, model, request_chars, response_chars).
type CallLog struct {
	ID            int64     `gorm:"primaryKey" json:"id"`
	Provider      string    `gorm:"size:32;not null;index" json:"provider"`
	Model         string    `gorm:"size:64;not null;index" json:"model"`
	Feature       string    `gorm:"size:32;index" json:"feature"` // translation / moderation / summarize / etc.
	Status        string    `gorm:"size:16;not null;index" json:"status"`
	LatencyMs     int       `json:"latency_ms"`
	RequestChars  int       `json:"request_chars"`
	ResponseChars int       `json:"response_chars"`
	ErrorMessage  string    `gorm:"size:400" json:"error_message,omitempty"`
	CreatedAt     time.Time `gorm:"autoCreateTime;index" json:"created_at"`
}

func (CallLog) TableName() string { return "llm_call_logs" }

const (
	CallStatusSuccess = "success"
	CallStatusError   = "error"
)
