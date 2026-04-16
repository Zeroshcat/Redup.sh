package bot

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"golang.org/x/net/proxy"
)

// WebhookClient is the narrow interface used to deliver an event to a user
// bot's own backend and read its reply. The platform never calls a third-party
// LLM on behalf of a user bot — the bot owner runs whatever model they want
// behind their webhook.
type WebhookClient interface {
	Deliver(ctx context.Context, webhookURL, apiKey string, payload WebhookPayload) (string, error)
}

// WebhookPayload is the JSON body the platform POSTs to a bot's webhook URL.
// SDKs in any language are expected to deserialize this shape and respond
// with `{ "reply": "..." }`.
type WebhookPayload struct {
	Event       string                `json:"event"`
	BotID       int64                 `json:"bot_id"`
	BotSlug     string                `json:"bot_slug"`
	TopicID     int64                 `json:"topic_id"`
	TopicTitle  string                `json:"topic_title"`
	TopicBody   string                `json:"topic_body,omitempty"`
	TriggerUser string                `json:"trigger_user,omitempty"`
	RecentPosts []WebhookPayloadPost  `json:"recent_posts,omitempty"`
}

type WebhookPayloadPost struct {
	Floor   int    `json:"floor"`
	Author  string `json:"author"`
	Content string `json:"content"`
	IsBot   bool   `json:"is_bot"`
}

type WebhookReply struct {
	Reply string `json:"reply"`
	Error string `json:"error,omitempty"`
}

// maxWebhookResponseBody caps how many bytes we read from a bot webhook
// response. Without this a malicious or buggy bot backend could exhaust
// server memory by returning gigabytes.
const maxWebhookResponseBody int64 = 1 << 20 // 1 MB

// HTTPWebhookClient is the default implementation: POST JSON, optional
// Authorization: Bearer <api_key> header, parse `{reply}`.
//
// Supports hot-swapping an outbound proxy at runtime via SetProxy — admins
// can flip between direct / HTTP / HTTPS / SOCKS5 egress without a restart.
type HTTPWebhookClient struct {
	mu      sync.RWMutex
	HTTP    *http.Client
	timeout time.Duration
}

func NewHTTPWebhookClient(timeout time.Duration) *HTTPWebhookClient {
	if timeout <= 0 {
		timeout = 15 * time.Second
	}
	return &HTTPWebhookClient{
		HTTP:    &http.Client{Timeout: timeout},
		timeout: timeout,
	}
}

// SetProxy replaces the underlying http.Client with one that routes
// outbound requests through the given proxy URL. Empty string disables
// the proxy and reverts to a direct client. Returns an error if the URL
// is malformed or uses an unsupported scheme.
//
// Supported schemes:
//   - http:// / https:// — CONNECT tunnel via net/http's standard proxy
//   - socks5:// / socks5h:// — net/proxy dialer wrapped into a Transport
func (c *HTTPWebhookClient) SetProxy(proxyURL string) error {
	proxyURL = strings.TrimSpace(proxyURL)
	c.mu.Lock()
	defer c.mu.Unlock()

	if proxyURL == "" {
		c.HTTP = &http.Client{Timeout: c.timeout}
		return nil
	}

	u, err := url.Parse(proxyURL)
	if err != nil {
		return fmt.Errorf("invalid proxy url: %w", err)
	}

	tr := &http.Transport{}
	switch strings.ToLower(u.Scheme) {
	case "http", "https":
		tr.Proxy = http.ProxyURL(u)
	case "socks5", "socks5h":
		dialer, err := proxy.FromURL(u, proxy.Direct)
		if err != nil {
			return fmt.Errorf("socks5 dialer: %w", err)
		}
		tr.DialContext = func(ctx context.Context, network, addr string) (net.Conn, error) {
			return dialer.Dial(network, addr)
		}
	default:
		return fmt.Errorf("unsupported proxy scheme: %s", u.Scheme)
	}

	c.HTTP = &http.Client{Timeout: c.timeout, Transport: tr}
	return nil
}

func (c *HTTPWebhookClient) Deliver(ctx context.Context, webhookURL, apiKey string, payload WebhookPayload) (string, error) {
	if !strings.HasPrefix(webhookURL, "https://") && !strings.HasPrefix(webhookURL, "http://") {
		return "", errors.New("webhook url must start with http(s)://")
	}
	buf, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	req, err := http.NewRequestWithContext(ctx, "POST", webhookURL, bytes.NewReader(buf))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "Redup-Bot-Dispatcher/1.0")
	if apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+apiKey)
	}
	c.mu.RLock()
	client := c.HTTP
	c.mu.RUnlock()
	res, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(res.Body, maxWebhookResponseBody))
	if res.StatusCode >= 400 {
		return "", fmt.Errorf("webhook %d: %s", res.StatusCode, truncForLog(raw, 200))
	}
	var out WebhookReply
	if err := json.Unmarshal(raw, &out); err != nil {
		return "", fmt.Errorf("webhook parse: %w (body=%s)", err, truncForLog(raw, 200))
	}
	if out.Error != "" {
		return "", errors.New(out.Error)
	}
	return strings.TrimSpace(out.Reply), nil
}

func truncForLog(b []byte, n int) string {
	if len(b) <= n {
		return string(b)
	}
	return string(b[:n]) + "…"
}
