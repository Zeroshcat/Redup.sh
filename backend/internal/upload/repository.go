package upload

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

func (r *Repository) Create(a *Attachment) error {
	return r.db.Create(a).Error
}

func (r *Repository) ByID(id int64) (*Attachment, error) {
	var a Attachment
	if err := r.db.Where("id = ? AND deleted_at IS NULL", id).First(&a).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &a, nil
}

func (r *Repository) ByIDs(ids []int64) ([]Attachment, error) {
	if len(ids) == 0 {
		return nil, nil
	}
	var items []Attachment
	err := r.db.Where("id IN ? AND deleted_at IS NULL", ids).Find(&items).Error
	return items, err
}

func (r *Repository) ByTarget(targetType string, targetID int64) ([]Attachment, error) {
	var items []Attachment
	err := r.db.Where("target_type = ? AND target_id = ? AND deleted_at IS NULL", targetType, targetID).
		Order("id ASC").Find(&items).Error
	return items, err
}

func (r *Repository) ByUserID(userID int64, limit int) ([]Attachment, error) {
	if limit <= 0 {
		limit = 30
	}
	var items []Attachment
	err := r.db.Where("user_id = ? AND deleted_at IS NULL", userID).
		Order("created_at DESC").Limit(limit).Find(&items).Error
	return items, err
}

// AttachTarget binds a list of orhpan attachments to a concrete target
// (topic or post). Only updates attachments that belong to the given user
// and have not yet been attached.
func (r *Repository) AttachTarget(ids []int64, targetType string, targetID int64, userID int64) error {
	if len(ids) == 0 {
		return nil
	}
	return r.db.Model(&Attachment{}).
		Where("id IN ? AND user_id = ? AND target_type = '' AND target_id = 0 AND deleted_at IS NULL",
			ids, userID).
		Updates(map[string]interface{}{
			"target_type": targetType,
			"target_id":   targetID,
		}).Error
}

// SoftDelete marks an attachment as deleted.
func (r *Repository) SoftDelete(id int64) error {
	return r.db.Model(&Attachment{}).Where("id = ? AND deleted_at IS NULL", id).
		UpdateColumn("deleted_at", gorm.Expr("NOW()")).Error
}
