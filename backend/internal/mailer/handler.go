package mailer

import (
	"fmt"

	"github.com/gin-gonic/gin"

	"github.com/redup/backend/internal/audit"
	httpx "github.com/redup/backend/internal/http"
)

// Handler exposes admin-only mail operations: right now, just a
// "send a test message" endpoint that uses the live SMTP config.
type Handler struct {
	svc   *Service
	audit *audit.Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

func (h *Handler) SetAudit(a *audit.Service) { h.audit = a }

// RegisterAdmin mounts the admin endpoints. Caller applies auth + rbac.
func (h *Handler) RegisterAdmin(r *gin.RouterGroup) {
	r.POST("/mail/test", h.sendTest)
}

type testMailReq struct {
	To      string `json:"to" binding:"required"`
	Subject string `json:"subject"`
	Body    string `json:"body"`
}

// sendTest dispatches a one-off message to the supplied address using
// the live SMTP credentials. Admins use this right after saving the
// SMTP section to verify the loop is healthy end-to-end. The error
// path surfaces the underlying SMTP error verbatim so the admin has
// enough signal to fix a typo without digging into server logs —
// these messages are never shown to end users.
func (h *Handler) sendTest(c *gin.Context) {
	if !h.svc.Ready() {
		httpx.ValidationError(c, "smtp_not_configured", "SMTP is not configured or disabled")
		return
	}

	var req testMailReq
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.BadRequest(c, "invalid request")
		return
	}
	if req.Subject == "" {
		req.Subject = "Redup SMTP test"
	}
	if req.Body == "" {
		req.Body = "This is a test message from Redup. If you can read this, outbound email is working."
	}

	if err := h.svc.Send(c.Request.Context(), SendInput{
		To:       req.To,
		Subject:  req.Subject,
		TextBody: req.Body,
	}); err != nil {
		httpx.ValidationError(c, "smtp_send_failed", fmt.Sprintf("send failed: %v", err))
		return
	}

	if h.audit != nil {
		h.audit.Record(c, audit.Input{
			Action:      "mail.test",
			TargetType:  "mail",
			TargetLabel: req.To,
		})
	}
	httpx.OK(c, gin.H{"ok": true, "to": req.To})
}
