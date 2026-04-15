package translation

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

func (r *Repository) Get(hash string) (*CacheEntry, error) {
	var e CacheEntry
	if err := r.db.Where("hash = ?", hash).First(&e).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &e, nil
}

func (r *Repository) Put(e *CacheEntry) error {
	return r.db.Create(e).Error
}
