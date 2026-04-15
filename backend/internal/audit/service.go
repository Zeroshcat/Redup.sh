package audit

import (
	"log"

	"github.com/gin-gonic/gin"

	"github.com/redup/backend/internal/auth"
)

// UserLookup snapshots the actor's username at log time. Wired by main.go from
// the user service so this package stays free of cross-module imports.
type UserLookup interface {
	UsernameByID(id int64) (string, error)
}

type Service struct {
	repo  *Repository
	users UserLookup
}

func NewService(repo *Repository, users UserLookup) *Service {
	return &Service{repo: repo, users: users}
}

// Input is the action-specific subset a caller fills in. Actor and IP are
// derived from the request context inside Record.
type Input struct {
	Action      string
	TargetType  string
	TargetID    int64
	TargetLabel string
	Detail      string
}

// Record persists an audit entry. Failures are logged but never returned —
// the audit trail must never block a successful admin action. Pass nil ctx
// for background calls (actor/IP will be empty).
func (s *Service) Record(c *gin.Context, in Input) {
	if s == nil || s.repo == nil {
		return
	}
	var actorID int64
	var ip string
	if c != nil {
		actorID, _ = auth.CurrentUserID(c)
		ip = c.ClientIP()
	}
	username := ""
	if actorID > 0 && s.users != nil {
		username, _ = s.users.UsernameByID(actorID)
	}
	entry := &Log{
		ActorUserID:   actorID,
		ActorUsername: username,
		Action:        in.Action,
		TargetType:    in.TargetType,
		TargetID:      in.TargetID,
		TargetLabel:   in.TargetLabel,
		Detail:        in.Detail,
		IP:            ip,
	}
	if err := s.repo.Create(entry); err != nil {
		log.Printf("audit: failed to record %s: %v", in.Action, err)
	}
}

func (s *Service) List(opts ListOptions) ([]Log, int64, error) {
	return s.repo.List(opts)
}
