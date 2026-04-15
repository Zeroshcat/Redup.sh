package audit

import "gorm.io/gorm"

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
	Action     string
	ActorID    int64
	TargetType string
	Limit      int
	Offset     int
}

func (r *Repository) List(opts ListOptions) ([]Log, int64, error) {
	q := r.db.Model(&Log{})
	if opts.Action != "" {
		q = q.Where("action = ?", opts.Action)
	}
	if opts.ActorID > 0 {
		q = q.Where("actor_user_id = ?", opts.ActorID)
	}
	if opts.TargetType != "" {
		q = q.Where("target_type = ?", opts.TargetType)
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
