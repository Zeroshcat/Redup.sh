package llm

// Service is the platform-level entry point for system features that need to
// call an LLM (translation, moderation, summarization). It wraps a Router so
// callers don't need to know which provider is configured.
type Service struct {
	router *Router
	repo   *Repository
}

func NewService(router *Router) *Service {
	return &Service{router: router}
}

// SetRepository wires the admin-query surface. The router is independently
// configured with an observer in main.go — the service only reads.
func (s *Service) SetRepository(repo *Repository) { s.repo = repo }

// Available reports which providers were registered at boot time. Useful for
// startup logs and admin diagnostics.
func (s *Service) Available() []string {
	if s.router == nil {
		return nil
	}
	return s.router.Available()
}

// ---------- Admin queries ----------

func (s *Service) List(opts ListOptions) ([]CallLog, int64, error) {
	if s.repo == nil {
		return nil, 0, nil
	}
	return s.repo.List(opts)
}

func (s *Service) Stats() ([]StatRow, error) {
	if s.repo == nil {
		return nil, nil
	}
	return s.repo.Stats()
}
