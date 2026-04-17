// Package llm provides platform-level LLM clients for system features such as
// post translation, automatic moderation, summarization and recommendations.
//
// This package is intentionally separate from the user-facing bot module:
// user bots are driven by their owner's own backend over webhook, so the
// platform never pays for their inference. The clients here are funded by
// the platform itself via env-var API keys.
package llm

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"
)

// thinkTagRe matches the chain-of-thought blocks emitted by reasoning
// models (DeepSeek-R1, Qwen-thinking, GPT-OSS, ...) when they leak the CoT
// into the main content channel instead of a separate reasoning_content
// field. We strip these centrally so every feature gets a clean answer.
var thinkTagRe = regexp.MustCompile(`(?is)<think>.*?</think>`)

func stripThinking(s string) string {
	return strings.TrimSpace(thinkTagRe.ReplaceAllString(s, ""))
}

// Client is the narrow interface a platform feature calls. Implementations
// are provider-specific (OpenAI, Anthropic, ...).
type Client interface {
	Complete(ctx context.Context, systemPrompt, userMessage, modelName string) (string, error)
}

// CallObserver is invoked after every routed call completes, with or
// without an error. Implementations must be non-blocking — the observer is
// called from the inference hot path and must not add user-visible
// latency. main.go wires a DB-backed observer; tests leave it nil.
type CallObserver interface {
	OnLLMCall(CallLog)
}

// ProviderConfig is the subset of site.LLMProvider the router needs to
// construct a client. Mirrored here (rather than importing site) so the
// llm package stays free of cross-module deps.
type ProviderConfig struct {
	ID      string
	Kind    string // "openai" | "anthropic"
	BaseURL string
	APIKey  string
	Enabled bool
}

// Router dispatches a Complete call to the right backend based on a string
// provider key. main.go loads providers from site_settings at boot and
// reloads them in place whenever admins update the list — the mutex here
// makes that reload safe to race against in-flight Complete calls.
type Router struct {
	mu       sync.RWMutex
	clients  map[string]Client
	observer CallObserver
	timeout  time.Duration
}

func NewRouter() *Router {
	return &Router{
		clients: map[string]Client{},
		timeout: 30 * time.Second,
	}
}

// SetTimeout overrides the default per-call HTTP timeout. Used by
// ReplaceProviders when constructing new clients.
func (r *Router) SetTimeout(d time.Duration) {
	if d > 0 {
		r.mu.Lock()
		r.timeout = d
		r.mu.Unlock()
	}
}

// Register is the legacy static-config entry point. Kept for tests and
// edge cases that want to inject a mock client. Production code should
// go through ReplaceProviders so the admin panel stays authoritative.
func (r *Router) Register(provider string, c Client) {
	r.mu.Lock()
	r.clients[provider] = c
	r.mu.Unlock()
}

// ReplaceProviders atomically rebuilds the client map from a provider
// list. Disabled entries and entries missing credentials are skipped —
// they stay on the list so admins can toggle without retyping keys,
// but they won't be dispatched to.
func (r *Router) ReplaceProviders(providers []ProviderConfig) {
	r.mu.Lock()
	timeout := r.timeout
	r.mu.Unlock()

	next := map[string]Client{}
	for _, p := range providers {
		if !p.Enabled || p.ID == "" || p.APIKey == "" {
			continue
		}
		switch p.Kind {
		case "openai":
			next[p.ID] = NewOpenAIClient(p.APIKey, p.BaseURL, timeout)
		case "anthropic":
			next[p.ID] = NewAnthropicClient(p.APIKey, p.BaseURL, timeout)
		}
	}
	r.mu.Lock()
	r.clients = next
	r.mu.Unlock()
}

// SetObserver attaches the call observer. Call once at boot from main.go.
func (r *Router) SetObserver(o CallObserver) { r.observer = o }

// CompleteWithFeature is the full entry point: the feature label ends up
// on the CallLog row so admins can tell "translation" apart from
// "moderation" without having to grep producer code. Complete is kept as
// a thin wrapper so existing callers don't need to change.
func (r *Router) CompleteWithFeature(ctx context.Context, feature, provider, model, systemPrompt, userMessage string) (string, error) {
	started := time.Now()
	out, err := r.doComplete(ctx, provider, model, systemPrompt, userMessage)
	if r.observer != nil {
		row := CallLog{
			Provider:      provider,
			Model:         model,
			Feature:       feature,
			LatencyMs:     int(time.Since(started).Milliseconds()),
			RequestChars:  len(systemPrompt) + len(userMessage),
			ResponseChars: len(out),
		}
		if err != nil {
			row.Status = CallStatusError
			row.ErrorMessage = err.Error()
			row.ResponseChars = 0
		} else {
			row.Status = CallStatusSuccess
		}
		r.observer.OnLLMCall(row)
	}
	return out, err
}

func (r *Router) Complete(ctx context.Context, provider, model, systemPrompt, userMessage string) (string, error) {
	return r.CompleteWithFeature(ctx, "", provider, model, systemPrompt, userMessage)
}

func (r *Router) doComplete(ctx context.Context, provider, model, systemPrompt, userMessage string) (string, error) {
	r.mu.RLock()
	c, ok := r.clients[provider]
	r.mu.RUnlock()
	if !ok {
		return "", fmt.Errorf("provider %q not configured", provider)
	}
	return c.Complete(ctx, systemPrompt, userMessage, model)
}

func (r *Router) Available() []string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]string, 0, len(r.clients))
	for k := range r.clients {
		out = append(out, k)
	}
	return out
}

// ---------- OpenAI ----------

type OpenAIClient struct {
	APIKey  string
	BaseURL string
	HTTP    *http.Client
}

func NewOpenAIClient(apiKey, baseURL string, timeout time.Duration) *OpenAIClient {
	if baseURL == "" {
		baseURL = "https://api.openai.com/v1"
	}
	return &OpenAIClient{
		APIKey:  apiKey,
		BaseURL: strings.TrimRight(baseURL, "/"),
		HTTP:    &http.Client{Timeout: timeout},
	}
}

type openaiMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type openaiReq struct {
	Model    string          `json:"model"`
	Messages []openaiMessage `json:"messages"`
}

type openaiResp struct {
	Choices []struct {
		Message openaiMessage `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

func (c *OpenAIClient) Complete(ctx context.Context, systemPrompt, userMessage, modelName string) (string, error) {
	if c.APIKey == "" {
		return "", errors.New("openai api key not configured")
	}
	body := openaiReq{
		Model: modelName,
		Messages: []openaiMessage{
			{Role: "system", Content: systemPrompt},
			{Role: "user", Content: userMessage},
		},
	}
	buf, err := json.Marshal(body)
	if err != nil {
		return "", err
	}
	req, err := http.NewRequestWithContext(ctx, "POST", c.BaseURL+"/chat/completions", bytes.NewReader(buf))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.APIKey)
	res, err := c.HTTP.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(res.Body)
	if res.StatusCode >= 400 {
		return "", fmt.Errorf("openai %d: %s", res.StatusCode, string(raw))
	}
	var out openaiResp
	if err := json.Unmarshal(raw, &out); err != nil {
		return "", fmt.Errorf("openai parse: %w", err)
	}
	if out.Error != nil {
		return "", errors.New(out.Error.Message)
	}
	if len(out.Choices) == 0 {
		return "", errors.New("openai: empty response")
	}
	return stripThinking(out.Choices[0].Message.Content), nil
}

// ---------- Anthropic ----------

type AnthropicClient struct {
	APIKey  string
	BaseURL string
	HTTP    *http.Client
}

func NewAnthropicClient(apiKey, baseURL string, timeout time.Duration) *AnthropicClient {
	if baseURL == "" {
		baseURL = "https://api.anthropic.com/v1"
	}
	return &AnthropicClient{
		APIKey:  apiKey,
		BaseURL: strings.TrimRight(baseURL, "/"),
		HTTP:    &http.Client{Timeout: timeout},
	}
}

type anthropicMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type anthropicReq struct {
	Model     string             `json:"model"`
	System    string             `json:"system,omitempty"`
	MaxTokens int                `json:"max_tokens"`
	Messages  []anthropicMessage `json:"messages"`
}

type anthropicResp struct {
	Content []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	} `json:"content"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

func (c *AnthropicClient) Complete(ctx context.Context, systemPrompt, userMessage, modelName string) (string, error) {
	if c.APIKey == "" {
		return "", errors.New("anthropic api key not configured")
	}
	body := anthropicReq{
		Model:     modelName,
		System:    systemPrompt,
		MaxTokens: 4096,
		Messages: []anthropicMessage{
			{Role: "user", Content: userMessage},
		},
	}
	buf, err := json.Marshal(body)
	if err != nil {
		return "", err
	}
	req, err := http.NewRequestWithContext(ctx, "POST", c.BaseURL+"/messages", bytes.NewReader(buf))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", c.APIKey)
	req.Header.Set("anthropic-version", "2023-06-01")
	res, err := c.HTTP.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(res.Body)
	if res.StatusCode >= 400 {
		return "", fmt.Errorf("anthropic %d: %s", res.StatusCode, string(raw))
	}
	var out anthropicResp
	if err := json.Unmarshal(raw, &out); err != nil {
		return "", fmt.Errorf("anthropic parse: %w", err)
	}
	if out.Error != nil {
		return "", errors.New(out.Error.Message)
	}
	var sb strings.Builder
	for _, c := range out.Content {
		if c.Type == "text" {
			sb.WriteString(c.Text)
		}
	}
	s := stripThinking(sb.String())
	if s == "" {
		return "", errors.New("anthropic: empty response")
	}
	return s, nil
}
