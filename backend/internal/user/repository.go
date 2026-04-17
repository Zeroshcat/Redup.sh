package user

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

func (r *Repository) Create(u *User) error {
	return r.db.Create(u).Error
}

// CreateWithFirstAdminBootstrap inserts a user, promoting them to admin if they
// are the first user in the system. Runs in a transaction to avoid races where
// two concurrent registrations both see count == 0.
func (r *Repository) CreateWithFirstAdminBootstrap(u *User) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		var count int64
		if err := tx.Model(&User{}).Count(&count).Error; err != nil {
			return err
		}
		if count == 0 {
			u.Role = "admin"
		}
		return tx.Create(u).Error
	})
}

// EnsureAdminExists is a safety net: if no admin user exists but at least one
// user does, promote the earliest user to admin. Called at server startup to
// cover upgrade paths and misconfigurations.
func (r *Repository) EnsureAdminExists() (bool, error) {
	var adminCount int64
	if err := r.db.Model(&User{}).Where("role = ?", "admin").Count(&adminCount).Error; err != nil {
		return false, err
	}
	if adminCount > 0 {
		return false, nil
	}
	var first User
	if err := r.db.Order("id ASC").First(&first).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return false, nil
		}
		return false, err
	}
	if err := r.db.Model(&first).Update("role", "admin").Error; err != nil {
		return false, err
	}
	return true, nil
}

func (r *Repository) FindByID(id int64) (*User, error) {
	var u User
	if err := r.db.First(&u, id).Error; err != nil {
		return nil, err
	}
	return &u, nil
}

func (r *Repository) FindByUsername(username string) (*User, error) {
	var u User
	if err := r.db.Where("username = ?", username).First(&u).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &u, nil
}

func (r *Repository) FindByEmail(email string) (*User, error) {
	var u User
	if err := r.db.Where("email = ?", email).First(&u).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &u, nil
}

func (r *Repository) UpdateStatus(id int64, status string) error {
	return r.db.Model(&User{}).Where("id = ?", id).
		UpdateColumn("status", status).Error
}

// AdjustCreditScore atomically applies a delta to a user's credit_score,
// clamping the result to [0, 100]. Returns the new value. Used by admin
// moderation paths — the delta can be negative (penalty) or positive
// (restoration after appeal).
func (r *Repository) AdjustCreditScore(id int64, delta int) (int, error) {
	var u User
	err := r.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			First(&u, id).Error; err != nil {
			return err
		}
		next := u.CreditScore + delta
		if next < 0 {
			next = 0
		}
		if next > 100 {
			next = 100
		}
		u.CreditScore = next
		return tx.Model(&User{}).Where("id = ?", id).
			UpdateColumn("credit_score", next).Error
	})
	if err != nil {
		return 0, err
	}
	return u.CreditScore, nil
}

// UpdateProfile writes the editable self-service profile fields. Only
// fields listed here are touched; username / email / role / status /
// balances stay untouched so a hostile client can't escalate via
// profile PUT.
func (r *Repository) UpdateProfile(id int64, avatarURL, bio, location, website string) error {
	return r.db.Model(&User{}).Where("id = ?", id).Updates(map[string]interface{}{
		"avatar_url": avatarURL,
		"bio":        bio,
		"location":   location,
		"website":    website,
	}).Error
}

// UpdateEmail swaps the email column and stamps email_verified_at
// atomically. Callers are expected to have already validated
// uniqueness; a race against another writer still trips the unique
// index and surfaces a driver error the service translates.
func (r *Repository) UpdateEmail(id int64, email string, verifiedAt time.Time) error {
	return r.db.Model(&User{}).Where("id = ?", id).Updates(map[string]interface{}{
		"email":             email,
		"email_verified_at": verifiedAt,
	}).Error
}

// MarkEmailVerified stamps email_verified_at on the row. Idempotent:
// a second call just rewrites the same timestamp and doesn't disturb
// anything else. Caller is expected to have already validated the
// verification code before reaching here.
func (r *Repository) MarkEmailVerified(id int64, when time.Time) error {
	return r.db.Model(&User{}).Where("id = ?", id).
		UpdateColumn("email_verified_at", when).Error
}

// UpdatePasswordHash replaces the stored bcrypt hash. Caller must have
// already verified the old password and generated the new hash.
func (r *Repository) UpdatePasswordHash(id int64, newHash string) error {
	return r.db.Model(&User{}).Where("id = ?", id).
		UpdateColumn("password_hash", newHash).Error
}

type ListOptions struct {
	Search string
	Role   string
	Status string
	Limit  int
	Offset int
}

func (r *Repository) List(opts ListOptions) ([]User, int64, error) {
	q := r.db.Model(&User{})
	if opts.Search != "" {
		like := "%" + opts.Search + "%"
		q = q.Where("username ILIKE ? OR email ILIKE ?", like, like)
	}
	if opts.Role != "" {
		q = q.Where("role = ?", opts.Role)
	}
	if opts.Status != "" {
		q = q.Where("status = ?", opts.Status)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	if opts.Limit == 0 {
		opts.Limit = 50
	}
	q = q.Order("id ASC").Limit(opts.Limit).Offset(opts.Offset)
	var items []User
	if err := q.Find(&items).Error; err != nil {
		return nil, 0, err
	}
	return items, total, nil
}

func (r *Repository) FindByLogin(login string) (*User, error) {
	var u User
	if err := r.db.Where("username = ? OR email = ?", login, login).First(&u).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &u, nil
}
