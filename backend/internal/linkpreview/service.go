// Package linkpreview fetches Open Graph / Twitter Card metadata for a
// user-submitted URL and caches the result for reuse. The single
// chokepoint for preview rendering — frontend calls GET
// /api/link-preview?url=X and receives a normalized Preview row.
//
// Design:
//
//   - SSRF-safe: dial control refuses private / loopback / link-local
//     targets on every hop (see ssrf.go). Host is pre-resolved before
//     the TCP handshake so a clear error surface is available.
//   - Size / type bound: responses above 1 MiB, non-HTML, or served
//     over an unexpected scheme are rejected rather than parsed.
//   - Redis cache: sha256(canonical_url) keys. Successful previews
//     live 7 days, negative rows (404s, parse failures, blocked hosts)
//     live 1 hour — short enough to respect a site owner fixing a bad
//     OG tag, long enough to prevent request storms on bad URLs.
//   - Single-flight via SETNX lock key: two concurrent requesters for
//     the same URL wait on the same fetch; only one live HTTP call
//     goes out. Lock TTL is bounded so a crashed fetcher can't wedge
//     the URL forever.
package linkpreview

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

// Preview is the normalized wire shape returned by Fetch. Unknown
// fields collapse to empty strings — the renderer treats an empty
// title as "no card, fall back to plain link".
type Preview struct {
	URL          string    `json:"url"`
	CanonicalURL string    `json:"canonical_url,omitempty"`
	Title        string    `json:"title,omitempty"`
	Description  string    `json:"description,omitempty"`
	ImageURL     string    `json:"image_url,omitempty"`
	SiteName     string    `json:"site_name,omitempty"`
	FaviconURL   string    `json:"favicon_url,omitempty"`
	FetchedAt    time.Time `json:"fetched_at"`
	// Blocked is set when the preview could not be generated because
	// the host was rejected (SSRF, denylist, etc). Kept as a signal
	// rather than an error so the frontend can render a clean
	// "站点已被管理员屏蔽" state instead of a generic failure.
	Blocked bool `json:"blocked,omitempty"`
}

// PolicyProvider is the narrow read-only interface the service needs
// to consult the live admin policy for each request. Implementations
// adapt site_settings → these booleans without leaking the site
// package into this file.
type PolicyProvider interface {
	PreviewEnabled() bool
	DomainDenied(host string) bool
}

// Sentinel errors. Handlers map these to stable response codes.
var (
	ErrDisabled        = errors.New("link preview disabled by admin policy")
	ErrInvalidURL      = errors.New("invalid url")
	ErrBlockedHost     = errors.New("host blocked by policy")
	ErrUpstreamStatus  = errors.New("upstream returned a non-ok status")
	ErrUpstreamFailed  = errors.New("upstream fetch failed")
	ErrTooLarge        = errors.New("response too large")
	ErrUnsupportedType = errors.New("unsupported content-type")
)

const (
	maxBodyBytes    = 1 << 20 // 1 MiB
	totalTimeout    = 5 * time.Second
	ttlSuccess      = 7 * 24 * time.Hour
	ttlNegative     = time.Hour
	lockTTL         = 10 * time.Second
	userAgent       = "Redup-LinkPreview/1.0 (+link-preview-bot; opt-out via robots.txt User-agent)"
)

// Service is the live preview fetcher + cache facade.
type Service struct {
	rdb    *redis.Client
	policy PolicyProvider
	http   *http.Client

	// inflight deduplicates concurrent in-process Fetches for the same
	// URL. Redis SETNX covers the cross-process case; singleflight
	// saves one request from ever reaching Redis for the dup case
	// within a single instance.
	mu       sync.Mutex
	inflight map[string]*call
}

type call struct {
	done chan struct{}
	res  Preview
	err  error
}

// New wires up the fetcher with the SSRF-safe dialer and reasonable
// HTTP client defaults. The returned client follows up to 3
// redirects; each hop is re-checked by the dialer's Control hook, so
// a public host that 302s to an internal IP is still refused.
func New(rdb *redis.Client, policy PolicyProvider) *Service {
	dialer := newSafeDialer()
	transport := &http.Transport{
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			return dialer.DialContext(ctx, network, addr)
		},
		TLSHandshakeTimeout:   3 * time.Second,
		ResponseHeaderTimeout: 3 * time.Second,
		IdleConnTimeout:       30 * time.Second,
		MaxIdleConns:          32,
		DisableCompression:    false,
	}
	client := &http.Client{
		Transport: transport,
		Timeout:   totalTimeout,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 3 {
				return http.ErrUseLastResponse
			}
			return nil
		},
	}
	return &Service{
		rdb:      rdb,
		policy:   policy,
		http:     client,
		inflight: make(map[string]*call),
	}
}

// Lookup is the cache-only read path. Public endpoints call it for
// anonymous visitors so cached previews are visible to everyone
// (Discourse semantics) without letting random traffic drive live
// fetches. A miss returns (_, false, nil) — the handler translates
// that to a soft error the card-renderer already knows how to fall
// back from.
func (s *Service) Lookup(ctx context.Context, raw string) (Preview, bool, error) {
	if s.policy != nil && !s.policy.PreviewEnabled() {
		return Preview{}, false, ErrDisabled
	}
	normalized, _, err := normalizeURL(raw)
	if err != nil {
		return Preview{}, false, err
	}
	if p, ok := s.cacheGet(ctx, normalized); ok {
		return p, true, nil
	}
	return Preview{}, false, nil
}

// Fetch returns a Preview for the given URL, hitting the cache first
// and falling back to a live HTTP request when missing. The returned
// Preview always has a URL set; Title / Description / etc. are
// best-effort.
func (s *Service) Fetch(ctx context.Context, raw string) (Preview, error) {
	if s.policy != nil && !s.policy.PreviewEnabled() {
		return Preview{}, ErrDisabled
	}
	normalized, host, err := normalizeURL(raw)
	if err != nil {
		return Preview{}, err
	}
	if s.policy != nil && s.policy.DomainDenied(host) {
		blocked := Preview{URL: normalized, Blocked: true, FetchedAt: time.Now().UTC()}
		// Short-cache the blocked verdict so admins toggling the list
		// see the change within an hour rather than the full TTL.
		s.cacheSet(ctx, normalized, blocked, ttlNegative)
		return blocked, nil
	}

	// Cache hit wins over everything.
	if p, ok := s.cacheGet(ctx, normalized); ok {
		return p, nil
	}

	// In-process singleflight. The channel is both a wait primitive
	// and a signal — closing it publishes the result for late joiners.
	s.mu.Lock()
	if c, ok := s.inflight[normalized]; ok {
		s.mu.Unlock()
		select {
		case <-c.done:
			return c.res, c.err
		case <-ctx.Done():
			return Preview{}, ctx.Err()
		}
	}
	c := &call{done: make(chan struct{})}
	s.inflight[normalized] = c
	s.mu.Unlock()

	// Cross-process singleflight via Redis. Miss → we own the fetch;
	// hit → another process is fetching, we wait on the cache key
	// with a short spin. We don't re-delete our own lock key on exit
	// because the TTL already bounds its lifetime.
	lockKey := "linkpreview:lock:" + hashKey(normalized)
	gotLock, _ := s.rdb.SetNX(ctx, lockKey, "1", lockTTL).Result()
	if !gotLock {
		if p, ok := s.waitCache(ctx, normalized, lockTTL); ok {
			s.finishInflight(normalized, c, p, nil)
			return p, nil
		}
		// Peer crashed / slow — fall through and fetch ourselves.
	}

	res, err := s.fetchLive(ctx, normalized)
	if err != nil {
		log.Printf("[linkpreview] fetch failed for %q: %v", normalized, err)
		neg := Preview{URL: normalized, FetchedAt: time.Now().UTC()}
		s.cacheSet(ctx, normalized, neg, ttlNegative)
		s.finishInflight(normalized, c, neg, err)
		return neg, err
	}
	s.cacheSet(ctx, normalized, res, ttlSuccess)
	s.finishInflight(normalized, c, res, nil)
	return res, nil
}

func (s *Service) finishInflight(key string, c *call, res Preview, err error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	c.res = res
	c.err = err
	close(c.done)
	delete(s.inflight, key)
}

// waitCache polls the cache key up to timeout, returning the value
// once it lands. Used when another process is holding the fetch lock.
func (s *Service) waitCache(ctx context.Context, key string, timeout time.Duration) (Preview, bool) {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if p, ok := s.cacheGet(ctx, key); ok {
			return p, true
		}
		select {
		case <-ctx.Done():
			return Preview{}, false
		case <-time.After(200 * time.Millisecond):
		}
	}
	return Preview{}, false
}

// fetchLive is the real HTTP round-trip + parse. Must not be called
// without holding the inflight lock so a redirect-loop on one peer
// doesn't become N parallel aborted dials across workers.
func (s *Service) fetchLive(ctx context.Context, rawURL string) (Preview, error) {
	u, err := url.Parse(rawURL)
	if err != nil {
		return Preview{}, ErrInvalidURL
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return Preview{}, ErrInvalidURL
	}
	// Pre-resolve so the caller sees ErrBlockedHost on a private IP
	// rather than a generic dial error.
	if err := resolveAndCheck(ctx, u.Hostname()); err != nil {
		if errors.Is(err, errBlockedTarget) {
			return Preview{}, ErrBlockedHost
		}
		return Preview{}, ErrUpstreamFailed
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return Preview{}, ErrInvalidURL
	}
	req.Header.Set("User-Agent", userAgent)
	req.Header.Set("Accept", "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5")
	req.Header.Set("Accept-Language", "en;q=0.9, *;q=0.5")

	resp, err := s.http.Do(req)
	if err != nil {
		if errors.Is(err, errBlockedTarget) {
			return Preview{}, ErrBlockedHost
		}
		return Preview{}, fmt.Errorf("%w: %v", ErrUpstreamFailed, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return Preview{}, fmt.Errorf("%w: %d", ErrUpstreamStatus, resp.StatusCode)
	}
	ct := strings.ToLower(resp.Header.Get("Content-Type"))
	if !strings.Contains(ct, "text/html") && !strings.Contains(ct, "application/xhtml") {
		return Preview{}, ErrUnsupportedType
	}

	limited := io.LimitReader(resp.Body, maxBodyBytes+1)
	raw, err := io.ReadAll(limited)
	if err != nil {
		return Preview{}, fmt.Errorf("%w: %v", ErrUpstreamFailed, err)
	}
	if len(raw) > maxBodyBytes {
		return Preview{}, ErrTooLarge
	}

	base := resp.Request.URL // final URL after redirects — resolveReference baseline
	title, desc, image, siteName, canonical, favicon := parseHTML(strings.NewReader(string(raw)), base)

	p := Preview{
		URL:          rawURL,
		CanonicalURL: canonical,
		Title:        clip(title, 200),
		Description:  clip(desc, 400),
		ImageURL:     image,
		SiteName:     clip(siteName, 80),
		FaviconURL:   favicon,
		FetchedAt:    time.Now().UTC(),
	}
	if p.SiteName == "" && base != nil {
		p.SiteName = base.Host
	}
	if p.Title == "" {
		// A page with no title and no OG data rarely produces a useful
		// card — treat as a soft failure so the renderer falls back to
		// the plain link. Still worth caching as a negative.
		return Preview{}, fmt.Errorf("%w: no metadata found", ErrUpstreamFailed)
	}
	return p, nil
}

// normalizeURL trims whitespace, enforces http(s), and drops URL
// fragments (which never influence server-side metadata). Returns the
// cleaned URL + host in lowercase.
func normalizeURL(raw string) (string, string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", "", ErrInvalidURL
	}
	u, err := url.Parse(raw)
	if err != nil {
		return "", "", ErrInvalidURL
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return "", "", ErrInvalidURL
	}
	if u.Host == "" {
		return "", "", ErrInvalidURL
	}
	u.Fragment = ""
	host := strings.ToLower(u.Hostname())
	return u.String(), host, nil
}

func clip(s string, n int) string {
	s = strings.TrimSpace(s)
	if len(s) <= n {
		return s
	}
	// Clip on rune boundaries so we never store invalid UTF-8 —
	// Postgres would later reject it if we ever persist this.
	runes := []rune(s)
	if len(runes) <= n {
		return s
	}
	return string(runes[:n]) + "…"
}

// ---------- cache helpers ----------

func hashKey(u string) string {
	sum := sha256.Sum256([]byte(u))
	return hex.EncodeToString(sum[:16]) // 32 hex chars is plenty
}

func (s *Service) cacheKey(u string) string { return "linkpreview:v1:" + hashKey(u) }

func (s *Service) cacheGet(ctx context.Context, u string) (Preview, bool) {
	val, err := s.rdb.Get(ctx, s.cacheKey(u)).Result()
	if err != nil {
		return Preview{}, false
	}
	var p Preview
	if err := json.Unmarshal([]byte(val), &p); err != nil {
		return Preview{}, false
	}
	return p, true
}

func (s *Service) cacheSet(ctx context.Context, u string, p Preview, ttl time.Duration) {
	data, err := json.Marshal(p)
	if err != nil {
		return
	}
	_ = s.rdb.Set(ctx, s.cacheKey(u), data, ttl).Err()
}
