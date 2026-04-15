package auth

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type TokenKind string

const (
	TokenAccess  TokenKind = "access"
	TokenRefresh TokenKind = "refresh"
)

type Claims struct {
	UserID int64     `json:"uid"`
	Role   string    `json:"role,omitempty"`
	Kind   TokenKind `json:"kind"`
	jwt.RegisteredClaims
}

// Revoker is the narrow interface JWTManager uses to consult the logout
// blocklist. Implementations are Redis-backed in production. A nil
// revoker disables revocation entirely — tokens remain valid until their
// natural expiry — which matches the original pre-blocklist behaviour.
type Revoker interface {
	// IsRevoked returns true when the given JTI has been logged out and
	// should be refused. Implementations should fail-open on backend
	// errors: a Redis outage must not lock every user out.
	IsRevoked(jti string) bool
	// Revoke marks a JTI as logged out for the given ttl. Callers pass
	// the token's remaining lifetime so expired entries drop naturally.
	Revoke(jti string, ttl time.Duration)
}

type JWTManager struct {
	accessSecret  []byte
	refreshSecret []byte
	accessTTL     time.Duration
	refreshTTL    time.Duration
	revoker       Revoker
}

func (j *JWTManager) SetRevoker(r Revoker) { j.revoker = r }

// Revoke marks an issued token as logged out. Used by the logout handler.
// The TTL is derived from the token's own expiry so we don't pin stale
// entries in Redis forever.
func (j *JWTManager) Revoke(claims *Claims) {
	if j.revoker == nil || claims == nil || claims.ID == "" {
		return
	}
	remaining := time.Until(claims.ExpiresAt.Time)
	if remaining <= 0 {
		return
	}
	j.revoker.Revoke(claims.ID, remaining)
}

func NewJWTManager(accessSecret, refreshSecret string, accessTTLMin, refreshTTLDays int) *JWTManager {
	return &JWTManager{
		accessSecret:  []byte(accessSecret),
		refreshSecret: []byte(refreshSecret),
		accessTTL:     time.Duration(accessTTLMin) * time.Minute,
		refreshTTL:    time.Duration(refreshTTLDays) * 24 * time.Hour,
	}
}

func (j *JWTManager) IssuePair(userID int64, role string) (access, refresh string, err error) {
	access, err = j.sign(userID, role, TokenAccess, j.accessSecret, j.accessTTL)
	if err != nil {
		return
	}
	refresh, err = j.sign(userID, role, TokenRefresh, j.refreshSecret, j.refreshTTL)
	return
}

// newJTI returns a random hex identifier baked into every signed token.
// The JTI is what the revocation blocklist keys on — by setting a short
// Redis key when a token is logged out, the middleware can refuse any
// token whose JTI matches before even reading the claims.
func newJTI() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	return hex.EncodeToString(b[:])
}

func (j *JWTManager) sign(userID int64, role string, kind TokenKind, secret []byte, ttl time.Duration) (string, error) {
	claims := Claims{
		UserID: userID,
		Role:   role,
		Kind:   kind,
		RegisteredClaims: jwt.RegisteredClaims{
			ID:        newJTI(),
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(ttl)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "redup",
		},
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return tok.SignedString(secret)
}

func (j *JWTManager) ParseAccess(token string) (*Claims, error) {
	return j.parse(token, j.accessSecret, TokenAccess)
}

func (j *JWTManager) ParseRefresh(token string) (*Claims, error) {
	return j.parse(token, j.refreshSecret, TokenRefresh)
}

func (j *JWTManager) parse(token string, secret []byte, expectedKind TokenKind) (*Claims, error) {
	claims := &Claims{}
	parsed, err := jwt.ParseWithClaims(token, claims, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return secret, nil
	})
	if err != nil {
		return nil, err
	}
	if !parsed.Valid {
		return nil, errors.New("invalid token")
	}
	if claims.Kind != expectedKind {
		return nil, errors.New("wrong token kind")
	}
	if j.revoker != nil && claims.ID != "" && j.revoker.IsRevoked(claims.ID) {
		return nil, errors.New("token revoked")
	}
	return claims, nil
}

func (j *JWTManager) AccessTTLSeconds() int {
	return int(j.accessTTL.Seconds())
}
