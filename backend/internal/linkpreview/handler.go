package linkpreview

import (
	"errors"

	"github.com/gin-gonic/gin"

	"github.com/redup/backend/internal/auth"
	httpx "github.com/redup/backend/internal/http"
)

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

// RegisterPublic mounts the preview endpoint under the public route
// group. Cached rows are readable by everyone (Discourse semantics);
// only an authenticated caller can trigger a live fetch on a cache
// miss — anon requests fall through to a soft "not cached" response
// which the frontend renders as a plain fallback link. OptionalAuth
// middleware runs upstream so CurrentUserID works here.
func (h *Handler) RegisterPublic(r *gin.RouterGroup) {
	r.GET("/link-preview", h.fetch)
}

// Error codes specific to the link-preview surface. Other codes
// (bad_request, internal_error, rate_limited) come from the shared
// httpx constants.
const (
	codeDisabled    = "link_preview_disabled"
	codeInvalidURL  = "invalid_url"
	codeBlockedHost = "host_blocked"
	codeFetchFailed = "preview_fetch_failed"
	codeNotCached   = "link_preview_not_cached"
)

func (h *Handler) fetch(c *gin.Context) {
	raw := c.Query("url")
	if raw == "" {
		httpx.ValidationError(c, codeInvalidURL, "url query parameter required")
		return
	}

	// Anon requests get cache-only behaviour; only a signed-in caller
	// drives a live fetch on cache miss. This keeps random crawlers
	// from using the service as a generic OG scraper while still
	// letting every visitor see a previously-generated card.
	if _, authed := auth.CurrentUserID(c); !authed {
		p, ok, err := h.svc.Lookup(c.Request.Context(), raw)
		switch {
		case err != nil && errors.Is(err, ErrDisabled):
			httpx.Fail(c, 503, codeDisabled, "link preview is disabled")
		case err != nil && errors.Is(err, ErrInvalidURL):
			httpx.ValidationError(c, codeInvalidURL, "invalid url")
		case err != nil:
			httpx.Internal(c, err.Error())
		case ok:
			httpx.OK(c, p)
		default:
			httpx.Fail(c, 404, codeNotCached, "link preview not cached")
		}
		return
	}

	p, err := h.svc.Fetch(c.Request.Context(), raw)
	switch {
	case err == nil:
		httpx.OK(c, p)
	case errors.Is(err, ErrDisabled):
		httpx.Fail(c, 503, codeDisabled, "link preview is disabled")
	case errors.Is(err, ErrInvalidURL):
		httpx.ValidationError(c, codeInvalidURL, "invalid url")
	case errors.Is(err, ErrBlockedHost):
		httpx.Fail(c, 403, codeBlockedHost, "host is blocked by policy")
	default:
		httpx.Fail(c, 502, codeFetchFailed, "could not fetch link preview")
	}
}
