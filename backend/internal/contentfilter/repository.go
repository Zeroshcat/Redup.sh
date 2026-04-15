package contentfilter

import (
	"errors"

	"gorm.io/gorm"
)

var ErrNotFound = errors.New("word not found")

type Repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

func (r *Repository) Create(w *Word) error {
	return r.db.Create(w).Error
}

func (r *Repository) Update(w *Word) error {
	return r.db.Model(&Word{}).Where("id = ?", w.ID).Updates(map[string]interface{}{
		"word":     w.Word,
		"severity": w.Severity,
		"note":     w.Note,
		"enabled":  w.Enabled,
	}).Error
}

func (r *Repository) Delete(id int64) error {
	res := r.db.Delete(&Word{}, id)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *Repository) ByID(id int64) (*Word, error) {
	var w Word
	if err := r.db.First(&w, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &w, nil
}

func (r *Repository) List() ([]Word, error) {
	var items []Word
	err := r.db.Order("severity DESC, word ASC").Find(&items).Error
	return items, err
}

func (r *Repository) ListEnabled() ([]Word, error) {
	var items []Word
	err := r.db.Where("enabled = ?", true).Find(&items).Error
	return items, err
}
