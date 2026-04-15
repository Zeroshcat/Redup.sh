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
	"strings"
	"time"
)

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

// Router dispatches a Complete call to the right backend based on a string
// provider key. main.go registers whichever providers have keys configured.
type Router struct {
	clients  map[string]Client
	observer CallObserver
}

func NewRouter() *Router {
	return &Router{clients: map[string]Client{}}
}

func (r *Router) Register(provider string, c Client) {
	r.clients[provider] = c
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
	c, ok := r.clients[provider]
	if !ok {
		return "", fmt.Errorf("provider %q not configured", provider)
	}
	return c.Complete(ctx, systemPrompt, userMessage, model)
}

func (r *Router) Available() []string {
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
	return strings.TrimSpace(out.Choices[0].Message.Content), nil
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
		MaxTokens: 1024,
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
	s := strings.TrimSpace(sb.String())
	if s == "" {
		return "", errors.New("anthropic: empty response")
	}
	return s, nil
}
