package llm

import "gorm.io/gorm"

type Repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

func (r *Repository) Create(c *CallLog) error {
	return r.db.Create(c).Error
}

// ListOptions drives the admin browser for LLM calls. All fields are
// optional; Limit is capped server-side.
type ListOptions struct {
	Provider string
	Model    string
	Feature  string
	Status   string
	Limit    int
	Offset   int
}

func (r *Repository) List(opts ListOptions) ([]CallLog, int64, error) {
	q := r.db.Model(&CallLog{})
	if opts.Provider != "" {
		q = q.Where("provider = ?", opts.Provider)
	}
	if opts.Model != "" {
		q = q.Where("model = ?", opts.Model)
	}
	if opts.Feature != "" {
		q = q.Where("feature = ?", opts.Feature)
	}
	if opts.Status != "" {
		q = q.Where("status = ?", opts.Status)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	if opts.Limit <= 0 || opts.Limit > 500 {
		opts.Limit = 100
	}
	q = q.Order("created_at DESC").Limit(opts.Limit).Offset(opts.Offset)
	var items []CallLog
	if err := q.Find(&items).Error; err != nil {
		return nil, 0, err
	}
	return items, total, nil
}

// StatRow is one bucket of the aggregate view. Used by the admin dashboard
// to answer "which provider/model is consuming the most budget this week".
type StatRow struct {
	Provider       string  `json:"provider"`
	Model          string  `json:"model"`
	Calls          int64   `json:"calls"`
	Errors         int64   `json:"errors"`
	AvgLatencyMs   float64 `json:"avg_latency_ms"`
	TotalReqChars  int64   `json:"total_req_chars"`
	TotalRespChars int64   `json:"total_resp_chars"`
}

// Stats groups every call by (provider, model) and returns aggregates.
// Error column uses COUNT FILTER equivalent via CASE WHEN so the average
// latency stays over successful calls as well — a single aggregate per
// bucket is easier for the UI to render than multiple buckets per status.
func (r *Repository) Stats() ([]StatRow, error) {
	var out []StatRow
	err := r.db.Model(&CallLog{}).
		Select(`provider,
		        model,
		        COUNT(*) AS calls,
		        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS errors,
		        COALESCE(AVG(latency_ms), 0) AS avg_latency_ms,
		        COALESCE(SUM(request_chars), 0) AS total_req_chars,
		        COALESCE(SUM(response_chars), 0) AS total_resp_chars`).
		Group("provider, model").
		Order("calls DESC").
		Scan(&out).Error
	return out, err
}
