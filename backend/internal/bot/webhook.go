package bot

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
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

// HTTPWebhookClient is the default implementation: POST JSON, optional
// Authorization: Bearer <api_key> header, parse `{reply}`.
type HTTPWebhookClient struct {
	HTTP *http.Client
}

func NewHTTPWebhookClient(timeout time.Duration) *HTTPWebhookClient {
	if timeout <= 0 {
		timeout = 15 * time.Second
	}
	return &HTTPWebhookClient{HTTP: &http.Client{Timeout: timeout}}
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
	res, err := c.HTTP.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(res.Body)
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
