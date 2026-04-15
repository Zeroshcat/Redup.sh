package moderation

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

func (r *Repository) Create(l *Log) error {
	return r.db.Create(l).Error
}

type ListOptions struct {
	Verdict string
	Limit   int
	Offset  int
}

func (r *Repository) List(opts ListOptions) ([]Log, int64, error) {
	q := r.db.Model(&Log{})
	if opts.Verdict != "" {
		q = q.Where("verdict = ?", opts.Verdict)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	if opts.Limit == 0 {
		opts.Limit = 100
	}
	q = q.Order("created_at DESC").Limit(opts.Limit).Offset(opts.Offset)
	var items []Log
	if err := q.Find(&items).Error; err != nil {
		return nil, 0, err
	}
	return items, total, nil
}

func (r *Repository) ByID(id int64) (*Log, error) {
	var l Log
	if err := r.db.First(&l, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &l, nil
}

func (r *Repository) UpdateTargetID(logID, targetID int64) error {
	return r.db.Model(&Log{}).Where("id = ?", logID).
		UpdateColumn("target_id", targetID).Error
}

func (r *Repository) MarkResolved(logID int64) error {
	return r.db.Model(&Log{}).Where("id = ?", logID).
		UpdateColumn("resolved", true).Error
}

// CountUnresolvedByActor returns the number of unresolved warn/block logs
// attributed to the given user — used to decide whether to auto-escalate
// them into the report queue.
func (r *Repository) CountUnresolvedByActor(actorID int64) (int64, error) {
	var n int64
	err := r.db.Model(&Log{}).
		Where("actor_user_id = ? AND resolved = ? AND verdict IN ?",
			actorID, false, []string{VerdictWarn, VerdictBlock}).
		Count(&n).Error
	return n, err
}

func (r *Repository) Counts() (map[string]int64, error) {
	out := map[string]int64{
		VerdictPass:  0,
		VerdictWarn:  0,
		VerdictBlock: 0,
	}
	rows := []struct {
		Verdict string
		N       int64
	}{}
	if err := r.db.Model(&Log{}).
		Select("verdict, COUNT(*) AS n").
		Group("verdict").
		Scan(&rows).Error; err != nil {
		return nil, err
	}
	for _, row := range rows {
		out[row.Verdict] = row.N
	}
	return out, nil
}
