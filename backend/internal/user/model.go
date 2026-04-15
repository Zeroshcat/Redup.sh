package user

import "time"

type User struct {
	ID           int64     `gorm:"primaryKey" json:"id"`
	Username     string    `gorm:"size:32;uniqueIndex;not null" json:"username"`
	Email        string    `gorm:"size:255;uniqueIndex;not null" json:"email"`
	PasswordHash string    `gorm:"size:255;not null" json:"-"`
	AvatarURL    string    `gorm:"size:512" json:"avatar_url,omitempty"`
	Bio          string    `gorm:"type:text" json:"bio,omitempty"`
	Location     string    `gorm:"size:64" json:"location,omitempty"`
	Website      string    `gorm:"size:255" json:"website,omitempty"`
	CreditScore  int       `gorm:"default:100" json:"credit_score"` // legacy moderation trust score
	Credits      int       `gorm:"default:0" json:"credits"`         // spendable wallet balance
	XP           int       `gorm:"default:0" json:"xp"`              // lifetime experience points
	Level        int16     `gorm:"default:1" json:"level"`
	Role         string    `gorm:"size:32;default:'user'" json:"role"`
	Status       string    `gorm:"size:16;default:'active'" json:"status"`
	JoinedAt     time.Time `gorm:"autoCreateTime" json:"joined_at"`
	UpdatedAt    time.Time `gorm:"autoUpdateTime" json:"updated_at"`
}

func (User) TableName() string { return "users" }
