package follow

import "errors"

var (
	ErrSelfFollow = errors.New("cannot follow yourself")
	ErrNotFound   = errors.New("user not found")
)

// Notifier is the narrow interface the follow service needs to push a
// notification to the followed user. Wired by main.go and may be nil.
type Notifier interface {
	NotifyFollow(recipientID, actorID int64, actorUsername string)
}

// UserLookup snapshots the actor's username at notify time.
type UserLookup interface {
	UsernameByID(id int64) (string, error)
	Exists(id int64) (bool, error)
}

type Service struct {
	repo     *Repository
	users    UserLookup
	notifier Notifier
}

func NewService(repo *Repository, users UserLookup) *Service {
	return &Service{repo: repo, users: users}
}

func (s *Service) SetNotifier(n Notifier) { s.notifier = n }

// Follow makes followerID follow targetID. Idempotent — re-following an
// already-followed user is a no-op (no error, no duplicate notification).
func (s *Service) Follow(followerID, targetID int64) error {
	if followerID == 0 || targetID == 0 {
		return ErrNotFound
	}
	if followerID == targetID {
		return ErrSelfFollow
	}
	if exists, err := s.users.Exists(targetID); err != nil {
		return err
	} else if !exists {
		return ErrNotFound
	}
	already, err := s.repo.Exists(followerID, targetID)
	if err != nil {
		return err
	}
	if already {
		return nil
	}
	if err := s.repo.Create(&Follow{FollowerID: followerID, TargetID: targetID}); err != nil {
		return err
	}
	if s.notifier != nil {
		actorName, _ := s.users.UsernameByID(followerID)
		s.notifier.NotifyFollow(targetID, followerID, actorName)
	}
	return nil
}

func (s *Service) Unfollow(followerID, targetID int64) error {
	if followerID == 0 || targetID == 0 {
		return ErrNotFound
	}
	_, err := s.repo.Delete(followerID, targetID)
	return err
}

func (s *Service) IsFollowing(followerID, targetID int64) (bool, error) {
	if followerID == 0 || targetID == 0 {
		return false, nil
	}
	return s.repo.Exists(followerID, targetID)
}

type Stats struct {
	Followers  int64 `json:"followers"`
	Following  int64 `json:"following"`
	IsFollowing bool `json:"is_following"`
}

func (s *Service) Stats(viewerID, targetID int64) (Stats, error) {
	var out Stats
	followers, err := s.repo.FollowerCount(targetID)
	if err != nil {
		return out, err
	}
	following, err := s.repo.FollowingCount(targetID)
	if err != nil {
		return out, err
	}
	out.Followers = followers
	out.Following = following
	if viewerID > 0 && viewerID != targetID {
		isFollowing, err := s.repo.Exists(viewerID, targetID)
		if err != nil {
			return out, err
		}
		out.IsFollowing = isFollowing
	}
	return out, nil
}
