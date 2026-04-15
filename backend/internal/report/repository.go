package report

import (
	"errors"

	"gorm.io/gorm"
)

type Repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

func (r *Repository) Create(rep *Report) error {
	return r.db.Create(rep).Error
}

func (r *Repository) ByID(id int64) (*Report, error) {
	var rep Report
	if err := r.db.First(&rep, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &rep, nil
}

// HasPendingByReporter returns true when this user already has a pending
// report against the same target — used to dedupe noisy submitters.
func (r *Repository) HasPendingByReporter(reporterID int64, targetType string, targetID int64) (bool, error) {
	var n int64
	err := r.db.Model(&Report{}).
		Where("reporter_user_id = ? AND target_type = ? AND target_id = ? AND status = ?",
			reporterID, targetType, targetID, StatusPending).
		Count(&n).Error
	return n > 0, err
}

type ListOptions struct {
	Status string // empty = all
	Limit  int
	Offset int
}

func (r *Repository) List(opts ListOptions) ([]Report, error) {
	q := r.db.Model(&Report{})
	if opts.Status != "" {
		q = q.Where("status = ?", opts.Status)
	}
	if opts.Limit == 0 {
		opts.Limit = 50
	}
	q = q.Order("created_at DESC").Limit(opts.Limit).Offset(opts.Offset)
	var items []Report
	err := q.Find(&items).Error
	return items, err
}

type StatusCounts struct {
	Pending   int64 `json:"pending"`
	Resolved  int64 `json:"resolved"`
	Dismissed int64 `json:"dismissed"`
	All       int64 `json:"all"`
}

func (r *Repository) Counts() (StatusCounts, error) {
	var out StatusCounts
	rows := []struct {
		Status string
		N      int64
	}{}
	if err := r.db.Model(&Report{}).
		Select("status, COUNT(*) AS n").
		Group("status").
		Scan(&rows).Error; err != nil {
		return out, err
	}
	for _, row := range rows {
		switch row.Status {
		case StatusPending:
			out.Pending = row.N
		case StatusResolved:
			out.Resolved = row.N
		case StatusDismissed:
			out.Dismissed = row.N
		}
		out.All += row.N
	}
	return out, nil
}

func (r *Repository) UpdateStatus(rep *Report) error {
	return r.db.Model(&Report{}).Where("id = ?", rep.ID).Updates(map[string]interface{}{
		"status":           rep.Status,
		"handler_user_id":  rep.HandlerUserID,
		"handler_username": rep.HandlerUsername,
		"resolution_note":  rep.ResolutionNote,
		"handled_at":       rep.HandledAt,
	}).Error
}
