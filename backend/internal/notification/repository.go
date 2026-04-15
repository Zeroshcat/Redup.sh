package notification

import "gorm.io/gorm"

type Repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

func (r *Repository) Create(n *Notification) error {
	return r.db.Create(n).Error
}

type ListOptions struct {
	UserID     int64
	Type       string
	UnreadOnly bool
	Limit      int
	Offset     int
}

func (r *Repository) List(opts ListOptions) ([]Notification, error) {
	q := r.db.Model(&Notification{}).Where("recipient_id = ?", opts.UserID)
	if opts.Type != "" {
		q = q.Where("type = ?", opts.Type)
	}
	if opts.UnreadOnly {
		q = q.Where("read = ?", false)
	}
	if opts.Limit == 0 {
		opts.Limit = 100
	}
	q = q.Order("created_at DESC").Limit(opts.Limit).Offset(opts.Offset)
	var items []Notification
	if err := q.Find(&items).Error; err != nil {
		return nil, err
	}
	return items, nil
}

func (r *Repository) CountUnread(userID int64) (int64, error) {
	var n int64
	err := r.db.Model(&Notification{}).
		Where("recipient_id = ? AND read = ?", userID, false).
		Count(&n).Error
	return n, err
}

func (r *Repository) MarkRead(userID, id int64) error {
	return r.db.Model(&Notification{}).
		Where("id = ? AND recipient_id = ?", id, userID).
		UpdateColumn("read", true).Error
}

func (r *Repository) MarkAllRead(userID int64) error {
	return r.db.Model(&Notification{}).
		Where("recipient_id = ? AND read = ?", userID, false).
		UpdateColumn("read", true).Error
}

// ---------- Admin queries ----------

// AdminListOptions is the admin-scoped filter set. Unlike the per-user
// ListOptions, RecipientID is optional: an empty value scans every user's
// notifications. ActorUserID lets an admin see "what has user X been
// doing to others" in the notification trail.
type AdminListOptions struct {
	RecipientID int64
	ActorUserID int64
	Type        string
	UnreadOnly  bool
	Limit       int
	Offset      int
}

// AdminList returns the notification firehose for admin inspection.
// Results are paginated and include a total for the UI pager.
func (r *Repository) AdminList(opts AdminListOptions) ([]Notification, int64, error) {
	q := r.db.Model(&Notification{})
	if opts.RecipientID > 0 {
		q = q.Where("recipient_id = ?", opts.RecipientID)
	}
	if opts.ActorUserID > 0 {
		q = q.Where("actor_user_id = ?", opts.ActorUserID)
	}
	if opts.Type != "" {
		q = q.Where("type = ?", opts.Type)
	}
	if opts.UnreadOnly {
		q = q.Where("read = ?", false)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	if opts.Limit <= 0 || opts.Limit > 500 {
		opts.Limit = 100
	}
	q = q.Order("created_at DESC").Limit(opts.Limit).Offset(opts.Offset)
	var items []Notification
	if err := q.Find(&items).Error; err != nil {
		return nil, 0, err
	}
	return items, total, nil
}

// TypeStat is one row of the type-aggregate view. Unread is a sub-count of
// Count so the admin panel can render "replies: 120 (30 unread)".
type TypeStat struct {
	Type   string `json:"type"`
	Count  int64  `json:"count"`
	Unread int64  `json:"unread"`
}

// StatsByType aggregates every notification row into per-type counts. Used
// by the admin notifications dashboard headline.
func (r *Repository) StatsByType() ([]TypeStat, error) {
	var out []TypeStat
	err := r.db.Model(&Notification{}).
		Select(`type,
		        COUNT(*) AS count,
		        SUM(CASE WHEN read = false THEN 1 ELSE 0 END) AS unread`).
		Group("type").
		Order("count DESC").
		Scan(&out).Error
	return out, err
}
