package bot

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

func (r *Repository) Create(b *Bot) error {
	return r.db.Create(b).Error
}

func (r *Repository) Update(b *Bot) error {
	return r.db.Model(&Bot{}).Where("id = ?", b.ID).Updates(map[string]interface{}{
		"name":           b.Name,
		"description":    b.Description,
		"avatar_url":     b.AvatarURL,
		"model_provider": b.ModelProvider,
		"model_name":     b.ModelName,
		"webhook_url":    b.WebhookURL,
		"api_key":        b.APIKey,
		"system_prompt":  b.SystemPrompt,
		"tags":           b.Tags,
	}).Error
}

func (r *Repository) UpdateStatus(b *Bot) error {
	return r.db.Model(&Bot{}).Where("id = ?", b.ID).Updates(map[string]interface{}{
		"status":         b.Status,
		"rejection_note": b.RejectionNote,
		"approved_by":    b.ApprovedBy,
		"approved_at":    b.ApprovedAt,
	}).Error
}

func (r *Repository) IncrementCallCount(id int64) error {
	return r.db.Model(&Bot{}).Where("id = ?", id).
		UpdateColumn("call_count", gorm.Expr("call_count + 1")).Error
}

func (r *Repository) UpdateFeatured(id int64, featured bool) error {
	return r.db.Model(&Bot{}).Where("id = ?", id).
		UpdateColumn("is_featured", featured).Error
}

func (r *Repository) UpdateModerator(id int64, enabled bool) error {
	return r.db.Model(&Bot{}).Where("id = ?", id).
		UpdateColumn("is_moderator", enabled).Error
}

// ListActiveModerators returns all active bots that carry the moderator
// flag — used by the forum moderation pipeline to fan out each new piece
// of content to its owner's webhook for a second-opinion verdict.
func (r *Repository) ListActiveModerators() ([]Bot, error) {
	var items []Bot
	err := r.db.Where("status = ? AND is_moderator = ?", StatusActive, true).
		Find(&items).Error
	return items, err
}

// CountActiveByOwner returns how many active bots the user owns. Used by
// the forum service to gate topic creation in bot-type categories.
func (r *Repository) CountActiveByOwner(ownerID int64) (int64, error) {
	if ownerID == 0 {
		return 0, nil
	}
	var n int64
	err := r.db.Model(&Bot{}).
		Where("owner_user_id = ? AND status = ?", ownerID, StatusActive).
		Count(&n).Error
	return n, err
}

func (r *Repository) Delete(id int64) error {
	return r.db.Delete(&Bot{}, id).Error
}

func (r *Repository) ByID(id int64) (*Bot, error) {
	var b Bot
	if err := r.db.First(&b, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &b, nil
}

func (r *Repository) BySlug(slug string) (*Bot, error) {
	var b Bot
	if err := r.db.Where("slug = ?", slug).First(&b).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &b, nil
}

type ListOptions struct {
	Status      string
	OwnerUserID int64
	Limit       int
	Offset      int
}

func (r *Repository) List(opts ListOptions) ([]Bot, int64, error) {
	q := r.db.Model(&Bot{})
	if opts.Status != "" {
		q = q.Where("status = ?", opts.Status)
	}
	if opts.OwnerUserID > 0 {
		q = q.Where("owner_user_id = ?", opts.OwnerUserID)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	if opts.Limit == 0 {
		opts.Limit = 50
	}
	q = q.Order("is_featured DESC, call_count DESC, id DESC").
		Limit(opts.Limit).Offset(opts.Offset)
	var items []Bot
	if err := q.Find(&items).Error; err != nil {
		return nil, 0, err
	}
	return items, total, nil
}
