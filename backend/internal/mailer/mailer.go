// Package mailer is the single chokepoint for all outbound email.
//
// Design goals:
//
//   - Config is held in memory and swapped atomically. Admin edits in
//     site_settings propagate via SetConfig without a restart, so the
//     "save + test" loop stays tight.
//   - Send is thread-safe and drops cleanly to an error when SMTP is
//     disabled or mis-configured — callers never panic, never block on a
//     network dial they can't satisfy.
//   - The underlying client (go-mail) is built per-send rather than held
//     open, because admins change host/port on the fly and a cached
//     connection would keep pointing at the old host.
package mailer

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	mail "github.com/wneessen/go-mail"
)

// Encryption modes mirror the choices we expose in the admin UI. The
// string values match what gets persisted in site_settings so the admin
// form and the mailer stay consistent.
const (
	EncryptionNone     = "none"
	EncryptionSTARTTLS = "starttls"
	EncryptionTLS      = "tls"
)

// Config is the minimal SMTP shape the mailer needs. Kept separate from
// site.SMTP so the platform/site package can depend on nothing and the
// mailer doesn't import the site package (both are wired by app.go).
type Config struct {
	Enabled     bool
	Host        string
	Port        int
	Username    string
	Password    string
	Encryption  string // "" / "none" / "starttls" / "tls"
	FromAddress string
	FromName    string
}

// Normalize fills in sensible defaults and trims whitespace so downstream
// callers never have to second-guess the shape.
func (c Config) Normalize() Config {
	c.Host = strings.TrimSpace(c.Host)
	c.Username = strings.TrimSpace(c.Username)
	c.FromAddress = strings.TrimSpace(c.FromAddress)
	c.FromName = strings.TrimSpace(c.FromName)
	c.Encryption = strings.ToLower(strings.TrimSpace(c.Encryption))
	if c.Encryption == "" {
		c.Encryption = EncryptionSTARTTLS
	}
	if c.Port == 0 {
		switch c.Encryption {
		case EncryptionTLS:
			c.Port = 465
		case EncryptionNone:
			c.Port = 25
		default:
			c.Port = 587
		}
	}
	return c
}

// Ready reports whether the current config has enough info to attempt a
// send. A mail service without a host or a from address is effectively
// disabled regardless of the Enabled flag.
func (c Config) Ready() bool {
	return c.Enabled && c.Host != "" && c.FromAddress != ""
}

// Service holds the live config and executes Send/SendTest. Safe for
// concurrent use: all reads and writes go through the mutex so hot
// reloads never race a send in flight.
type Service struct {
	mu  sync.RWMutex
	cfg Config
}

// New returns an empty mailer. Call SetConfig once site settings are
// loaded to arm it.
func New() *Service {
	return &Service{}
}

// SetConfig atomically replaces the in-memory config. Called on boot
// from the seeded site.smtp row and again every time the admin panel
// saves the SMTP section.
func (s *Service) SetConfig(c Config) {
	s.mu.Lock()
	s.cfg = c.Normalize()
	s.mu.Unlock()
}

// Config returns a copy of the current configuration. Primarily for
// handlers that want to report the live state alongside an operation
// result without exposing the mutex.
func (s *Service) Config() Config {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.cfg
}

// Ready reports whether a Send can be attempted with the current config.
func (s *Service) Ready() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.cfg.Ready()
}

// Sentinel errors so callers can branch on cause without string parsing.
var (
	ErrNotConfigured = errors.New("smtp is not configured")
	ErrDisabled      = errors.New("smtp is disabled")
	ErrMissingTo     = errors.New("recipient address required")
)

// SendInput is the narrow shape callers build. Plain text body is
// required; HTML is optional and, when provided, becomes the primary
// MIME alternative so HTML-capable clients render it.
type SendInput struct {
	To       string
	ToName   string
	Subject  string
	TextBody string
	HTMLBody string
}

// Send dispatches one message. Returns nil on success. A Redis/SMTP
// outage surfaces as an error; callers are expected to log + move on —
// email is best-effort and nothing in the product blocks on delivery.
func (s *Service) Send(ctx context.Context, in SendInput) error {
	s.mu.RLock()
	cfg := s.cfg
	s.mu.RUnlock()

	if !cfg.Enabled {
		return ErrDisabled
	}
	if cfg.Host == "" || cfg.FromAddress == "" {
		return ErrNotConfigured
	}
	if strings.TrimSpace(in.To) == "" {
		return ErrMissingTo
	}

	msg := mail.NewMsg()
	fromHeader := cfg.FromAddress
	if cfg.FromName != "" {
		fromHeader = fmt.Sprintf("%s <%s>", cfg.FromName, cfg.FromAddress)
	}
	if err := msg.From(fromHeader); err != nil {
		return fmt.Errorf("invalid from address: %w", err)
	}
	if in.ToName != "" {
		if err := msg.AddToFormat(in.ToName, in.To); err != nil {
			return fmt.Errorf("invalid recipient: %w", err)
		}
	} else {
		if err := msg.To(in.To); err != nil {
			return fmt.Errorf("invalid recipient: %w", err)
		}
	}
	msg.Subject(in.Subject)
	if in.TextBody != "" {
		msg.SetBodyString(mail.TypeTextPlain, in.TextBody)
	}
	if in.HTMLBody != "" {
		if in.TextBody == "" {
			msg.SetBodyString(mail.TypeTextHTML, in.HTMLBody)
		} else {
			msg.AddAlternativeString(mail.TypeTextHTML, in.HTMLBody)
		}
	}

	client, err := buildClient(cfg)
	if err != nil {
		return err
	}
	dialCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	return client.DialAndSendWithContext(dialCtx, msg)
}

func buildClient(cfg Config) (*mail.Client, error) {
	opts := []mail.Option{mail.WithPort(cfg.Port)}

	switch cfg.Encryption {
	case EncryptionTLS:
		opts = append(opts, mail.WithSSLPort(false))
	case EncryptionNone:
		opts = append(opts, mail.WithTLSPolicy(mail.NoTLS))
	default: // starttls
		opts = append(opts, mail.WithTLSPolicy(mail.TLSMandatory))
	}

	if cfg.Username != "" {
		opts = append(opts,
			mail.WithSMTPAuth(mail.SMTPAuthPlain),
			mail.WithUsername(cfg.Username),
			mail.WithPassword(cfg.Password),
		)
	}

	return mail.NewClient(cfg.Host, opts...)
}
