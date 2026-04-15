package site

import (
	"encoding/json"
	"errors"

	"gorm.io/datatypes"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type Repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

// Get returns the raw JSON bytes stored under a key, or nil if missing.
func (r *Repository) Get(key string) ([]byte, error) {
	var s Setting
	if err := r.db.Where("key = ?", key).First(&s).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return []byte(s.Value), nil
}

// Set upserts a key. updatedBy is optional; pass 0 for system actions.
func (r *Repository) Set(key string, value any, updatedBy int64) error {
	raw, err := json.Marshal(value)
	if err != nil {
		return err
	}
	s := Setting{
		Key:       key,
		Value:     datatypes.JSON(raw),
		UpdatedBy: updatedBy,
	}
	return r.db.Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "key"}},
		DoUpdates: clause.AssignmentColumns([]string{
			"value", "updated_at", "updated_by",
		}),
	}).Create(&s).Error
}
