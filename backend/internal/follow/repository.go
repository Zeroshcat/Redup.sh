package follow

import "gorm.io/gorm"

type Repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

func (r *Repository) Create(f *Follow) error {
	return r.db.Create(f).Error
}

func (r *Repository) Delete(followerID, targetID int64) (int64, error) {
	res := r.db.Where("follower_id = ? AND target_id = ?", followerID, targetID).
		Delete(&Follow{})
	return res.RowsAffected, res.Error
}

func (r *Repository) Exists(followerID, targetID int64) (bool, error) {
	var n int64
	err := r.db.Model(&Follow{}).
		Where("follower_id = ? AND target_id = ?", followerID, targetID).
		Count(&n).Error
	return n > 0, err
}

func (r *Repository) FollowerCount(targetID int64) (int64, error) {
	var n int64
	err := r.db.Model(&Follow{}).Where("target_id = ?", targetID).Count(&n).Error
	return n, err
}

func (r *Repository) FollowingCount(followerID int64) (int64, error) {
	var n int64
	err := r.db.Model(&Follow{}).Where("follower_id = ?", followerID).Count(&n).Error
	return n, err
}
