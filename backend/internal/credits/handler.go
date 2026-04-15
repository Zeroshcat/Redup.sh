package credits

import (
	"strconv"

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

// Register mounts user-facing wallet endpoints. Caller must apply auth
// middleware on the group beforehand.
func (h *Handler) Register(r *gin.RouterGroup) {
	r.GET("/users/me/wallet", h.wallet)
	r.GET("/users/me/credit-history", h.history)
}

func (h *Handler) wallet(c *gin.Context) {
	uid, _ := auth.CurrentUserID(c)
	if uid == 0 {
		httpx.Unauthorized(c, "auth required")
		return
	}
	out, err := h.svc.BalanceWithLevel(uid)
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	httpx.OK(c, out)
}

func (h *Handler) history(c *gin.Context) {
	uid, _ := auth.CurrentUserID(c)
	if uid == 0 {
		httpx.Unauthorized(c, "auth required")
		return
	}
	limit := 100
	if v := c.Query("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 500 {
			limit = n
		}
	}
	items, err := h.svc.History(uid, limit)
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	httpx.OK(c, items)
}

// ---------- Admin ----------

// RegisterAdmin mounts the credits admin surface. Caller applies auth +
// RequireRole(admin) on the group beforehand.
func (h *Handler) RegisterAdmin(r *gin.RouterGroup) {
	r.GET("/credits/transactions", h.adminListTransactions)
	r.GET("/credits/stats", h.adminStats)
	r.GET("/credits/users/:id/wallet", h.adminUserWallet)
	r.POST("/credits/adjust", h.adminAdjust)
}

type adminListResp struct {
	Items []Transaction `json:"items"`
	Total int64         `json:"total"`
}

func (h *Handler) adminListTransactions(c *gin.Context) {
	opts := ListOptions{
		Kind:   c.Query("kind"),
		Limit:  parseInt(c.Query("limit"), 100),
		Offset: parseInt(c.Query("offset"), 0),
	}
	if v := c.Query("user_id"); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil {
			opts.UserID = n
		}
	}
	items, total, err := h.svc.ListTransactions(opts)
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	httpx.OK(c, adminListResp{Items: items, Total: total})
}

func (h *Handler) adminStats(c *gin.Context) {
	stats, err := h.svc.StatsByKind()
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	httpx.OK(c, gin.H{"items": stats})
}

func (h *Handler) adminUserWallet(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		httpx.ValidationError(c, "invalid_input", "bad id")
		return
	}
	out, err := h.svc.BalanceWithLevel(id)
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	httpx.OK(c, out)
}

type adjustReq struct {
	UserID       int64  `json:"user_id"`
	XPDelta      int    `json:"xp_delta"`
	CreditsDelta int    `json:"credits_delta"`
	Note         string `json:"note"`
}

func (h *Handler) adminAdjust(c *gin.Context) {
	var body adjustReq
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.ValidationError(c, "invalid_input", err.Error())
		return
	}
	if body.UserID == 0 || (body.XPDelta == 0 && body.CreditsDelta == 0) {
		httpx.ValidationError(c, "invalid_input", "user_id and at least one non-zero delta required")
		return
	}
	adminID, _ := auth.CurrentUserID(c)
	out, err := h.svc.AdminAdjust(adminID, body.UserID, body.XPDelta, body.CreditsDelta, body.Note)
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	httpx.OK(c, out)
}

func parseInt(s string, def int) int {
	if s == "" {
		return def
	}
	n, err := strconv.Atoi(s)
	if err != nil {
		return def
	}
	return n
}
