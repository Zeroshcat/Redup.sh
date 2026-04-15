package announcement

import (
	"errors"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/redup/backend/internal/audit"
	httpx "github.com/redup/backend/internal/http"
)

type Handler struct {
	svc   *Service
	audit *audit.Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// SetAudit wires the audit recorder. main.go calls this before mounting
// the admin routes so every CRUD write lands in the audit trail.
func (h *Handler) SetAudit(a *audit.Service) { h.audit = a }

// record is the single audit-emission point for announcement writes.
// Kept internal so nothing outside this file can skip it.
func (h *Handler) record(c *gin.Context, action string, a *Announcement, detail string) {
	if h.audit == nil {
		return
	}
	label := ""
	var id int64
	if a != nil {
		label = a.Title
		id = a.ID
	}
	h.audit.Record(c, audit.Input{
		Action:      action,
		TargetType:  "announcement",
		TargetID:    id,
		TargetLabel: label,
		Detail:      detail,
	})
}

// RegisterPublic mounts the read-only active listing used by every client.
// Anonymous callers are allowed — announcements are meant to be seen.
func (h *Handler) RegisterPublic(r *gin.RouterGroup) {
	r.GET("/announcements", h.listActive)
}

// RegisterAdmin mounts the write surface under the admin auth group.
func (h *Handler) RegisterAdmin(r *gin.RouterGroup) {
	r.GET("/announcements", h.listAll)
	r.POST("/announcements", h.create)
	r.PUT("/announcements/:id", h.update)
	r.POST("/announcements/:id/publish", h.publish)
	r.DELETE("/announcements/:id", h.delete)
}

// writeInput is the JSON shape accepted by create and update. Start/End are
// RFC3339 strings (frontend passes Z-suffixed ISO); we parse them here so
// the service layer deals in *time.Time only.
type writeInput struct {
	Title       string `json:"title"`
	Content     string `json:"content"`
	Placement   string `json:"placement"`
	Level       string `json:"level"`
	StartAt     string `json:"start_at,omitempty"`
	EndAt       string `json:"end_at,omitempty"`
	Published   bool   `json:"published"`
	Dismissible bool   `json:"dismissible"`
}

func parseTime(s string) (*time.Time, error) {
	if s == "" {
		return nil, nil
	}
	t, err := time.Parse(time.RFC3339, s)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func (h *Handler) toServiceInput(in writeInput) (Input, error) {
	startAt, err := parseTime(in.StartAt)
	if err != nil {
		return Input{}, err
	}
	endAt, err := parseTime(in.EndAt)
	if err != nil {
		return Input{}, err
	}
	return Input{
		Title:       in.Title,
		Content:     in.Content,
		Placement:   in.Placement,
		Level:       in.Level,
		StartAt:     startAt,
		EndAt:       endAt,
		Published:   in.Published,
		Dismissible: in.Dismissible,
	}, nil
}

// writeErr maps domain errors to response envelope codes. Keep this small
// and explicit — unknown errors fall through to a 500 with no leak.
func writeErr(c *gin.Context, err error) {
	switch {
	case errors.Is(err, ErrNotFound):
		httpx.NotFound(c, err.Error())
	case errors.Is(err, ErrInvalidTitle),
		errors.Is(err, ErrInvalidContent),
		errors.Is(err, ErrInvalidPlacement),
		errors.Is(err, ErrInvalidLevel),
		errors.Is(err, ErrInvalidTimeRange):
		httpx.ValidationError(c, "invalid_input", err.Error())
	default:
		httpx.Internal(c, err.Error())
	}
}

type listResp struct {
	Items []Announcement `json:"items"`
}

func (h *Handler) listAll(c *gin.Context) {
	items, err := h.svc.ListAll()
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	httpx.OK(c, listResp{Items: items})
}

func (h *Handler) listActive(c *gin.Context) {
	placement := c.Query("placement")
	items, err := h.svc.ListActive(placement)
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	httpx.OK(c, listResp{Items: items})
}

func (h *Handler) create(c *gin.Context) {
	var in writeInput
	if err := c.ShouldBindJSON(&in); err != nil {
		httpx.ValidationError(c, "invalid_input", err.Error())
		return
	}
	svcIn, err := h.toServiceInput(in)
	if err != nil {
		httpx.ValidationError(c, "invalid_input", err.Error())
		return
	}
	a, err := h.svc.Create(svcIn)
	if err != nil {
		writeErr(c, err)
		return
	}
	h.record(c, "announcement.create", a, placementDetail(a))
	httpx.Created(c, a)
}

func (h *Handler) update(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		httpx.ValidationError(c, "invalid_input", "bad id")
		return
	}
	var in writeInput
	if err := c.ShouldBindJSON(&in); err != nil {
		httpx.ValidationError(c, "invalid_input", err.Error())
		return
	}
	svcIn, err := h.toServiceInput(in)
	if err != nil {
		httpx.ValidationError(c, "invalid_input", err.Error())
		return
	}
	a, err := h.svc.Update(id, svcIn)
	if err != nil {
		writeErr(c, err)
		return
	}
	h.record(c, "announcement.update", a, placementDetail(a))
	httpx.OK(c, a)
}

func (h *Handler) publish(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		httpx.ValidationError(c, "invalid_input", "bad id")
		return
	}
	var body struct {
		Published bool `json:"published"`
	}
	_ = c.ShouldBindJSON(&body)
	a, err := h.svc.SetPublished(id, body.Published)
	if err != nil {
		writeErr(c, err)
		return
	}
	action := "announcement.publish"
	if !body.Published {
		action = "announcement.unpublish"
	}
	h.record(c, action, a, placementDetail(a))
	httpx.OK(c, a)
}

func (h *Handler) delete(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		httpx.ValidationError(c, "invalid_input", "bad id")
		return
	}
	// Look up the row before deletion so the audit trail keeps a title/
	// placement snapshot even though the row itself is gone afterwards.
	var snapshot *Announcement
	if existing, _ := h.svc.repo.ByID(id); existing != nil {
		snapshot = existing
	}
	if err := h.svc.Delete(id); err != nil {
		writeErr(c, err)
		return
	}
	h.record(c, "announcement.delete", snapshot, placementDetail(snapshot))
	httpx.NoContent(c)
}

// placementDetail renders a one-line description of an announcement for
// the audit log Detail column. Handles nil gracefully so deletion can
// still log something useful when the row lookup missed.
func placementDetail(a *Announcement) string {
	if a == nil {
		return ""
	}
	status := "draft"
	if a.Published {
		status = "published"
	}
	return a.Placement + "/" + a.Level + "/" + status
}
