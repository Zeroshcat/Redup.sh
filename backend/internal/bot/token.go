package bot

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"strings"
	"time"

	"gorm.io/gorm"
)

// APIToken authenticates a bot's reverse calls into the platform's skill API.
// Plaintext is shown to the owner exactly once at issue time; the database
// stores only the SHA-256 hash so a leak of the row doesn't leak credentials.
type APIToken struct {
	ID         int64      `gorm:"primaryKey" json:"id"`
	BotID      int64      `gorm:"index;not null" json:"bot_id"`
	Name       string     `gorm:"size:64" json:"name"`
	TokenHash  string     `gorm:"size:64;uniqueIndex;not null" json:"-"`
	Prefix     string     `gorm:"size:16" json:"prefix"` // first 8 chars after `brt_` for display
	Scopes     string     `gorm:"size:256" json:"scopes"`
	LastUsedAt *time.Time `json:"last_used_at,omitempty"`
	CreatedAt  time.Time  `gorm:"autoCreateTime" json:"created_at"`
}

func (APIToken) TableName() string { return "bot_api_tokens" }

// DefaultScopes are granted to a freshly-issued token. Tighter scope control
// is a future feature — for now any token can read/write posts and search.
const DefaultScopes = "posts:read,posts:write,search,users:read"

const (
	ScopePostsRead  = "posts:read"
	ScopePostsWrite = "posts:write"
	ScopeSearch     = "search"
	ScopeUsersRead  = "users:read"
)

// HashToken returns the canonical SHA-256 hex digest of a plaintext token.
func HashToken(plain string) string {
	sum := sha256.Sum256([]byte(plain))
	return hex.EncodeToString(sum[:])
}

// generatePlainToken returns a `brt_` prefixed random token (16 random bytes
// → 32 hex chars). Collision probability is negligible.
func generatePlainToken() (string, error) {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return "brt_" + hex.EncodeToString(buf), nil
}

func displayPrefix(plain string) string {
	if len(plain) < 12 {
		return plain
	}
	return plain[:12] // e.g. "brt_a3f2b1c0"
}

func ScopesContains(scopes, want string) bool {
	for _, s := range strings.Split(scopes, ",") {
		if strings.TrimSpace(s) == want {
			return true
		}
	}
	return false
}

var ErrTokenNotFound = errors.New("api token not found")

// ---------- Repository methods ----------

func (r *Repository) CreateToken(t *APIToken) error {
	return r.db.Create(t).Error
}

func (r *Repository) ListTokens(botID int64) ([]APIToken, error) {
	var items []APIToken
	err := r.db.Where("bot_id = ?", botID).Order("created_at DESC").Find(&items).Error
	return items, err
}

func (r *Repository) DeleteToken(botID, tokenID int64) error {
	res := r.db.Where("id = ? AND bot_id = ?", tokenID, botID).Delete(&APIToken{})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrTokenNotFound
	}
	return nil
}

// FindTokenByHash is the lookup used by the auth middleware. Returns the
// token row alongside the bot it belongs to in one query.
func (r *Repository) FindTokenByHash(hash string) (*APIToken, *Bot, error) {
	var t APIToken
	if err := r.db.Where("token_hash = ?", hash).First(&t).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil, nil
		}
		return nil, nil, err
	}
	b, err := r.ByID(t.BotID)
	if err != nil || b == nil {
		return &t, nil, err
	}
	return &t, b, nil
}

func (r *Repository) TouchTokenLastUsed(id int64) error {
	now := time.Now()
	return r.db.Model(&APIToken{}).Where("id = ?", id).
		UpdateColumn("last_used_at", now).Error
}

// ---------- Service methods ----------

// IssuedToken pairs the persisted record with the plaintext value — only
// returned by Issue and never read back from the database.
type IssuedToken struct {
	Token string    `json:"token"`
	Row   *APIToken `json:"row"`
}

// IssueToken creates a new token for the bot. Caller (handler) is responsible
// for verifying that the actor is the bot's owner or an admin.
func (s *Service) IssueToken(botID int64, name string) (*IssuedToken, error) {
	b, err := s.repo.ByID(botID)
	if err != nil {
		return nil, err
	}
	if b == nil {
		return nil, ErrBotNotFound
	}
	plain, err := generatePlainToken()
	if err != nil {
		return nil, err
	}
	row := &APIToken{
		BotID:     botID,
		Name:      strings.TrimSpace(name),
		TokenHash: HashToken(plain),
		Prefix:    displayPrefix(plain),
		Scopes:    DefaultScopes,
	}
	if row.Name == "" {
		row.Name = "default"
	}
	if err := s.repo.CreateToken(row); err != nil {
		return nil, err
	}
	return &IssuedToken{Token: plain, Row: row}, nil
}

func (s *Service) ListTokens(botID int64) ([]APIToken, error) {
	return s.repo.ListTokens(botID)
}

func (s *Service) DeleteToken(botID, tokenID int64) error {
	return s.repo.DeleteToken(botID, tokenID)
}

// AuthenticateToken is called by middleware: given a plaintext bearer token,
// returns the bot it belongs to (or nil) and bumps last_used_at on hit.
func (s *Service) AuthenticateToken(plain string) (*Bot, *APIToken, error) {
	if !strings.HasPrefix(plain, "brt_") {
		return nil, nil, nil
	}
	hash := HashToken(plain)
	t, b, err := s.repo.FindTokenByHash(hash)
	if err != nil || t == nil || b == nil {
		return nil, nil, err
	}
	if b.Status != StatusActive {
		return nil, nil, errors.New("bot is not active")
	}
	_ = s.repo.TouchTokenLastUsed(t.ID)
	return b, t, nil
}
