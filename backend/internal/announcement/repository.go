package announcement

import (
	"errors"
	"time"

	"gorm.io/gorm"
)

type Repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

func (r *Repository) Create(a *Announcement) error {
	return r.db.Create(a).Error
}

func (r *Repository) ByID(id int64) (*Announcement, error) {
	var a Announcement
	if err := r.db.First(&a, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &a, nil
}

// Update writes the fields an admin is allowed to change. CreatedAt is never
// touched; UpdatedAt is bumped by GORM's autoUpdateTime.
func (r *Repository) Update(a *Announcement) error {
	return r.db.Model(&Announcement{}).Where("id = ?", a.ID).Updates(map[string]interface{}{
		"title":       a.Title,
		"content":     a.Content,
		"placement":   a.Placement,
		"level":       a.Level,
		"start_at":    a.StartAt,
		"end_at":      a.EndAt,
		"published":   a.Published,
		"dismissible": a.Dismissible,
	}).Error
}

func (r *Repository) Delete(id int64) error {
	return r.db.Delete(&Announcement{}, id).Error
}

// ListAll returns every announcement, newest first. Used by the admin panel
// which shows drafts alongside live entries.
func (r *Repository) ListAll() ([]Announcement, error) {
	var out []Announcement
	err := r.db.Order("created_at DESC").Find(&out).Error
	return out, err
}

// ListActive returns announcements that should be visible to end users right
// now. An announcement is active when published=true AND the current time
// falls within (start_at, end_at), with nil endpoints treated as open-ended.
// Optional placement filter lets the caller ask for e.g. just top banners.
func (r *Repository) ListActive(placement string) ([]Announcement, error) {
	now := time.Now()
	q := r.db.Model(&Announcement{}).
		Where("published = ?", true).
		Where("(start_at IS NULL OR start_at <= ?)", now).
		Where("(end_at IS NULL OR end_at >= ?)", now).
		Order("created_at DESC")
	if placement != "" {
		q = q.Where("placement = ?", placement)
	}
	var out []Announcement
	err := q.Find(&out).Error
	return out, err
}
