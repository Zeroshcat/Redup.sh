package invite

import (
	"errors"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type Repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

func (r *Repository) Create(c *Code) error {
	return r.db.Create(c).Error
}

func (r *Repository) FindByCode(code string) (*Code, error) {
	var c Code
	if err := r.db.Where("code = ?", code).First(&c).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &c, nil
}

func (r *Repository) FindByID(id int64) (*Code, error) {
	var c Code
	if err := r.db.First(&c, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &c, nil
}

// Consume atomically increments used_count under a row lock. Returns
// false if the code is expired, already at max uses, or not found.
func (r *Repository) Consume(code string, userID int64, username string) (bool, error) {
	return r.db.Transaction(func(tx *gorm.DB) error {
		var c Code
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("code = ?", code).First(&c).Error; err != nil {
			return err
		}
		if c.ExpiresAt != nil && c.ExpiresAt.Before(time.Now()) {
			return gorm.ErrRecordNotFound
		}
		if c.UsedCount >= c.MaxUses {
			return gorm.ErrRecordNotFound
		}
		if err := tx.Model(&Code{}).Where("id = ?", c.ID).
			UpdateColumn("used_count", gorm.Expr("used_count + 1")).Error; err != nil {
			return err
		}
		return tx.Create(&Usage{
			CodeID:   c.ID,
			UserID:   userID,
			Username: username,
		}).Error
	}) == nil, nil
}

type ListOptions struct {
	CreatorID int64
	Limit     int
	Offset    int
}

func (r *Repository) List(opts ListOptions) ([]Code, int64, error) {
	q := r.db.Model(&Code{})
	if opts.CreatorID > 0 {
		q = q.Where("creator_id = ?", opts.CreatorID)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	if opts.Limit <= 0 {
		opts.Limit = 50
	}
	var items []Code
	err := q.Order("created_at DESC").Limit(opts.Limit).Offset(opts.Offset).Find(&items).Error
	return items, total, err
}

func (r *Repository) UsagesForCode(codeID int64) ([]Usage, error) {
	var items []Usage
	err := r.db.Where("code_id = ?", codeID).Order("redeemed_at DESC").Find(&items).Error
	return items, err
}

func (r *Repository) Delete(id int64) error {
	return r.db.Delete(&Code{}, id).Error
}
