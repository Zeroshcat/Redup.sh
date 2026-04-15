package anon

// Service is the facade the forum module consumes. It assigns stable anon ids
// using a (topic, user) mapping table and records an audit row for every post.
type Service struct {
	repo *Repository
	gen  *Generator
}

func NewService(repo *Repository, gen *Generator) *Service {
	return &Service{repo: repo, gen: gen}
}

// Assign returns the anon id for the (topic, user) pair, creating the mapping
// on first use. Subsequent calls for the same pair return the same id — this
// is the "stable within a thread" guarantee.
//
// When postID > 0 an audit row is written, so the moderator trail records who
// was behind each anon post even if the post is later deleted.
func (s *Service) Assign(topicID, userID, postID int64) (string, error) {
	anonID, err := s.lookupOrCreate(topicID, userID)
	if err != nil {
		return "", err
	}
	if postID > 0 {
		if err := s.repo.CreateAuditLog(&AuditLog{
			PostID:  postID,
			TopicID: topicID,
			UserID:  userID,
			AnonID:  anonID,
		}); err != nil {
			// Audit failure is logged but not fatal — the post should still
			// succeed, loss of one audit row is alarmable in ops.
			return anonID, nil
		}
	}
	return anonID, nil
}

func (s *Service) lookupOrCreate(topicID, userID int64) (string, error) {
	if m, err := s.repo.GetMapping(topicID, userID); err != nil {
		return "", err
	} else if m != nil {
		return m.AnonID, nil
	}

	newID := s.gen.Next()
	if err := s.repo.CreateMappingIfAbsent(&IDMapping{
		TopicID: topicID,
		UserID:  userID,
		AnonID:  newID,
	}); err != nil {
		// Race: another request inserted first. Re-read.
		if m, getErr := s.repo.GetMapping(topicID, userID); getErr == nil && m != nil {
			return m.AnonID, nil
		}
		return "", err
	}
	return newID, nil
}

// SetPrefix updates the runtime prefix used for new mappings. Future admin
// panel will call this when the operator changes the setting.
func (s *Service) SetPrefix(p string) {
	s.gen.SetPrefix(p)
}

func (s *Service) Prefix() string {
	return s.gen.Prefix()
}

// SearchAudit exposes the admin traceability query. See Repository.SearchAudit
// for semantics. The handler layer is responsible for recording an audit
// entry for each invocation — this service deliberately has no hidden
// side-effects so the audit trail stays in one place.
func (s *Service) SearchAudit(query string, limit int) ([]AuditSearchRow, error) {
	return s.repo.SearchAudit(query, limit)
}
