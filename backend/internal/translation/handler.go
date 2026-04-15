package translation

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/redup/backend/internal/auth"
	httpx "github.com/redup/backend/internal/http"
)

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// Register mounts /api/translate. Caller must apply auth middleware on the
// group so we can charge the right user.
func (h *Handler) Register(r *gin.RouterGroup) {
	r.POST("/translate", h.translate)
}

type translateReq struct {
	Source     string `json:"source" binding:"required"`
	TargetLang string `json:"target_lang" binding:"required"`
}

func (h *Handler) translate(c *gin.Context) {
	uid, _ := auth.CurrentUserID(c)
	if uid == 0 {
		httpx.Unauthorized(c, "auth required")
		return
	}
	var req translateReq
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.BadRequest(c, "invalid request")
		return
	}
	out, err := h.svc.Translate(c.Request.Context(), uid, req.Source, req.TargetLang)
	if err != nil {
		switch {
		case errors.Is(err, ErrEmptySource):
			httpx.BadRequest(c, "source is empty")
		case errors.Is(err, ErrInvalidLang):
			httpx.ValidationError(c, "invalid_lang", "target_lang must be one of en/zh/ja/ko")
		case errors.Is(err, ErrNoProvider):
			httpx.Fail(c, http.StatusServiceUnavailable, "translation_unavailable",
				"translation provider is not configured")
		case errors.Is(err, ErrInsufficient):
			httpx.Fail(c, http.StatusPaymentRequired, "insufficient_credits",
				"余额不足，请等待每日免费额度刷新或赚取更多积分")
		default:
			httpx.Fail(c, http.StatusBadGateway, "translation_failed", err.Error())
		}
		return
	}
	httpx.OK(c, out)
}
