package forum

import (
	"errors"
	"time"

	"gorm.io/gorm"
)

type Repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

// ---------- Categories ----------

func (r *Repository) ListCategories() ([]Category, error) {
	var items []Category
	err := r.db.Order("sort_order ASC, id ASC").Find(&items).Error
	return items, err
}

func (r *Repository) CategoryBySlug(slug string) (*Category, error) {
	var c Category
	if err := r.db.Where("slug = ?", slug).First(&c).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &c, nil
}

func (r *Repository) CategoryByID(id int64) (*Category, error) {
	var c Category
	if err := r.db.First(&c, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &c, nil
}

func (r *Repository) CreateCategory(c *Category) error {
	return r.db.Create(c).Error
}

func (r *Repository) CountCategories() (int64, error) {
	var n int64
	err := r.db.Model(&Category{}).Count(&n).Error
	return n, err
}

// CountTopics returns the total number of non-deleted topics. Used by the
// admin dashboard for the "帖子" metric — soft-deleted rows are excluded so
// the headline matches what non-admin users actually see on the forum.
func (r *Repository) CountTopics() (int64, error) {
	var n int64
	err := r.db.Model(&Topic{}).Where("deleted_at IS NULL").Count(&n).Error
	return n, err
}

func (r *Repository) UpdateCategory(c *Category) error {
	return r.db.Model(&Category{}).Where("id = ?", c.ID).Updates(map[string]interface{}{
		"name":          c.Name,
		"slug":          c.Slug,
		"description":   c.Description,
		"type":          c.Type,
		"sort_order":    c.SortOrder,
		"post_cooldown": c.PostCooldown,
		"allow_bot":     c.AllowBot,
		"rules":         c.Rules,
	}).Error
}

func (r *Repository) DeleteCategory(id int64) error {
	return r.db.Delete(&Category{}, id).Error
}

func (r *Repository) MaxCategorySortOrder() (int, error) {
	var max int
	err := r.db.Model(&Category{}).Select("COALESCE(MAX(sort_order), 0)").Scan(&max).Error
	return max, err
}

// SwapCategorySortOrder atomically swaps sort_order between two categories.
// Used by the admin move-up/move-down action.
func (r *Repository) SwapCategorySortOrder(aID, bID int64) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		var a, b Category
		if err := tx.First(&a, aID).Error; err != nil {
			return err
		}
		if err := tx.First(&b, bID).Error; err != nil {
			return err
		}
		if err := tx.Model(&Category{}).Where("id = ?", a.ID).
			UpdateColumn("sort_order", b.SortOrder).Error; err != nil {
			return err
		}
		return tx.Model(&Category{}).Where("id = ?", b.ID).
			UpdateColumn("sort_order", a.SortOrder).Error
	})
}

func (r *Repository) ListCategoriesByType(typ string) ([]Category, error) {
	var items []Category
	err := r.db.Where("type = ?", typ).Order("sort_order ASC, id ASC").Find(&items).Error
	return items, err
}

// ---------- Topics ----------

type TopicListOptions struct {
	CategoryID int64
	// CategoryType ("normal" / "anon" / "bot") filters to topics whose
	// category is of the given type. Used by /anon and /bot hub pages so
	// they can show every thread across all sub-boards of that type
	// without enumerating category ids on the frontend. Ignored when
	// CategoryID is set — that's already a narrower filter.
	CategoryType string
	Sort         string // hot / latest / top
	Limit        int
	Offset       int
}

func (r *Repository) ListTopics(opts TopicListOptions) ([]Topic, error) {
	query := r.db.Model(&Topic{}).Where("topics.deleted_at IS NULL").Preload("User")
	if opts.CategoryID > 0 {
		// Single-category view also includes higher-level pins:
		//   level 3 (global) appears in every category
		//   level 2 (category-type) appears in every category sharing the same type
		typeSub := r.db.Model(&Category{}).Select("type").Where("id = ?", opts.CategoryID)
		sameTypeIDs := r.db.Model(&Category{}).Select("id").Where("type IN (?)", typeSub)
		query = query.Where(
			"category_id = ? OR pin_level = 3 OR (pin_level = 2 AND category_id IN (?))",
			opts.CategoryID, sameTypeIDs,
		)
	} else if opts.CategoryType != "" {
		// Type-scope view: every topic whose category has the matching type.
		// Uses a subquery so we don't have to round-trip for the id list.
		typeIDs := r.db.Model(&Category{}).Select("id").Where("type = ?", opts.CategoryType)
		query = query.Where("category_id IN (?)", typeIDs)
	}
	switch opts.Sort {
	case "top":
		query = query.Order("pin_level DESC, pin_weight DESC, like_count DESC, last_post_at DESC")
	case "latest":
		query = query.Order("pin_level DESC, pin_weight DESC, created_at DESC")
	default: // hot
		query = query.Order("pin_level DESC, pin_weight DESC, last_post_at DESC")
	}
	if opts.Limit == 0 {
		opts.Limit = 30
	}
	query = query.Limit(opts.Limit).Offset(opts.Offset)

	var items []Topic
	if err := query.Find(&items).Error; err != nil {
		return nil, err
	}
	// Enrich with category_slug for convenience (frontend uses slug for links)
	return r.fillCategorySlugs(items)
}

func (r *Repository) fillCategorySlugs(items []Topic) ([]Topic, error) {
	if len(items) == 0 {
		return items, nil
	}
	ids := make(map[int64]struct{})
	for _, t := range items {
		ids[t.CategoryID] = struct{}{}
	}
	idList := make([]int64, 0, len(ids))
	for id := range ids {
		idList = append(idList, id)
	}
	var cats []Category
	if err := r.db.Where("id IN ?", idList).Find(&cats).Error; err != nil {
		return nil, err
	}
	slugs := make(map[int64]string, len(cats))
	names := make(map[int64]string, len(cats))
	for _, c := range cats {
		slugs[c.ID] = c.Slug
		names[c.ID] = c.Name
	}
	for i := range items {
		items[i].CategorySlug = slugs[items[i].CategoryID]
		items[i].CategoryName = names[items[i].CategoryID]
	}
	return items, nil
}

func (r *Repository) TopicByID(id int64) (*Topic, error) {
	var t Topic
	if err := r.db.Preload("User").
		Where("id = ? AND deleted_at IS NULL", id).First(&t).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	if cat, err := r.CategoryByID(t.CategoryID); err == nil && cat != nil {
		t.CategorySlug = cat.Slug
		t.CategoryName = cat.Name
	}
	return &t, nil
}

func (r *Repository) CreateTopic(t *Topic) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		t.LastPostAt = time.Now()
		if err := tx.Create(t).Error; err != nil {
			return err
		}
		return tx.Model(&Category{}).Where("id = ?", t.CategoryID).
			UpdateColumn("topic_count", gorm.Expr("topic_count + 1")).Error
	})
}

func (r *Repository) SetTopicLocked(id int64, locked bool) error {
	return r.db.Model(&Topic{}).Where("id = ?", id).
		UpdateColumn("is_locked", locked).Error
}

func (r *Repository) SetTopicPin(id int64, level int16, weight int) error {
	return r.db.Model(&Topic{}).Where("id = ?", id).Updates(map[string]interface{}{
		"pin_level":  level,
		"pin_weight": weight,
	}).Error
}

func (r *Repository) SetTopicFeatured(id int64, featured bool) error {
	return r.db.Model(&Topic{}).Where("id = ?", id).
		UpdateColumn("is_featured", featured).Error
}

func (r *Repository) SoftDeleteTopic(id int64) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		var t Topic
		if err := tx.Where("id = ? AND deleted_at IS NULL", id).First(&t).Error; err != nil {
			return err
		}
		now := time.Now()
		if err := tx.Model(&Topic{}).Where("id = ?", id).
			UpdateColumn("deleted_at", now).Error; err != nil {
			return err
		}
		return tx.Model(&Category{}).Where("id = ?", t.CategoryID).
			UpdateColumn("topic_count", gorm.Expr("GREATEST(topic_count - 1, 0)")).Error
	})
}

func (r *Repository) PostByID(id int64) (*Post, error) {
	var p Post
	if err := r.db.Where("id = ? AND deleted_at IS NULL", id).First(&p).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &p, nil
}

// RecentDuplicateTopic returns true if the given user already posted a
// topic with the exact same title+body inside the window. Used as a
// cheap server-side double-submit guard — the check runs against the
// primary index on user_id + recent timestamps.
func (r *Repository) RecentDuplicateTopic(userID int64, title, body string, window time.Duration) (bool, error) {
	if userID == 0 {
		return false, nil
	}
	since := time.Now().Add(-window)
	var count int64
	err := r.db.Model(&Topic{}).
		Where("user_id = ? AND title = ? AND body = ? AND created_at >= ? AND deleted_at IS NULL",
			userID, title, body, since).
		Count(&count).Error
	return count > 0, err
}

// RecentDuplicatePost returns true if the given user already posted an
// identical reply in the same topic inside the window.
func (r *Repository) RecentDuplicatePost(userID, topicID int64, content string, window time.Duration) (bool, error) {
	if userID == 0 {
		return false, nil
	}
	since := time.Now().Add(-window)
	var count int64
	err := r.db.Model(&Post{}).
		Where("user_id = ? AND topic_id = ? AND content = ? AND created_at >= ? AND deleted_at IS NULL",
			userID, topicID, content, since).
		Count(&count).Error
	return count > 0, err
}

// UpdateTopicBody rewrites a topic's body/excerpt and stamps edited_at.
// Scoped to non-deleted rows so a concurrent soft-delete can't resurrect one.
func (r *Repository) UpdateTopicBody(id int64, body, excerpt string, editedAt time.Time) error {
	return r.db.Model(&Topic{}).
		Where("id = ? AND deleted_at IS NULL", id).
		Updates(map[string]any{
			"body":      body,
			"excerpt":   excerpt,
			"edited_at": editedAt,
		}).Error
}

// UpdatePostContent rewrites a reply's content and stamps edited_at.
func (r *Repository) UpdatePostContent(id int64, content string, editedAt time.Time) error {
	return r.db.Model(&Post{}).
		Where("id = ? AND deleted_at IS NULL", id).
		Updates(map[string]any{
			"content":   content,
			"edited_at": editedAt,
		}).Error
}

func (r *Repository) SoftDeletePost(id int64) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		var p Post
		if err := tx.Where("id = ? AND deleted_at IS NULL", id).First(&p).Error; err != nil {
			return err
		}
		now := time.Now()
		if err := tx.Model(&Post{}).Where("id = ?", id).
			UpdateColumn("deleted_at", now).Error; err != nil {
			return err
		}
		return tx.Model(&Topic{}).Where("id = ?", p.TopicID).
			UpdateColumn("reply_count", gorm.Expr("GREATEST(reply_count - 1, 0)")).Error
	})
}

func (r *Repository) IncrementTopicView(id int64) error {
	return r.db.Model(&Topic{}).Where("id = ?", id).
		UpdateColumn("view_count", gorm.Expr("view_count + 1")).Error
}

func (r *Repository) UpdateTopicAnonID(id int64, anonID string) error {
	return r.db.Model(&Topic{}).Where("id = ?", id).
		UpdateColumn("anon_id", anonID).Error
}

func (r *Repository) UpdatePostAnonID(id int64, anonID string) error {
	return r.db.Model(&Post{}).Where("id = ?", id).
		UpdateColumn("anon_id", anonID).Error
}

func (r *Repository) ListTopicsByUserID(userID int64, limit int) ([]Topic, error) {
	if limit == 0 {
		limit = 30
	}
	var items []Topic
	err := r.db.Preload("User").
		Where("user_id = ? AND deleted_at IS NULL AND is_anon = false", userID).
		Order("created_at DESC").Limit(limit).Find(&items).Error
	if err != nil {
		return nil, err
	}
	return r.fillCategorySlugs(items)
}

func (r *Repository) ListPostsByUserID(userID int64, limit int) ([]Post, error) {
	if limit == 0 {
		limit = 30
	}
	var items []Post
	err := r.db.Preload("User").
		Where("user_id = ? AND deleted_at IS NULL AND is_anon = false", userID).
		Order("created_at DESC").Limit(limit).Find(&items).Error
	return items, err
}

func (r *Repository) UserRefByID(id int64) (*UserRef, error) {
	var u UserRef
	if err := r.db.Where("id = ?", id).First(&u).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &u, nil
}

// FollowedTopics returns recent topics created by users the viewer follows.
// Anonymous topics are excluded — the whole point of follow is identity.
func (r *Repository) FollowedTopics(viewerID int64, limit int) ([]Topic, error) {
	if limit <= 0 {
		limit = 30
	}
	var items []Topic
	sub := r.db.Table("follows").
		Select("target_id").
		Where("follower_id = ?", viewerID)
	err := r.db.Model(&Topic{}).
		Where("topics.deleted_at IS NULL").
		Where("is_anon = ?", false).
		Where("user_id IN (?)", sub).
		Preload("User").
		Order("created_at DESC").
		Limit(limit).
		Find(&items).Error
	if err != nil {
		return nil, err
	}
	return r.fillCategorySlugs(items)
}

// SearchTopics returns topics whose title matches the query. Plain ILIKE
// substring match — fine for Phase 1; can be replaced with PG full-text or
// Meilisearch later.
func (r *Repository) SearchTopics(q string, limit int) ([]Topic, error) {
	if limit <= 0 {
		limit = 20
	}
	var items []Topic
	tx := r.db.Where("deleted_at IS NULL")
	if q != "" {
		tx = tx.Where("title ILIKE ?", "%"+q+"%")
	}
	err := tx.Order("created_at DESC").Limit(limit).Find(&items).Error
	return items, err
}

func (r *Repository) PostByTopicAndFloor(topicID int64, floor int) (*Post, error) {
	var p Post
	if err := r.db.Where("topic_id = ? AND floor = ? AND deleted_at IS NULL", topicID, floor).
		First(&p).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &p, nil
}

func (r *Repository) UserRefByUsername(username string) (*UserRef, error) {
	var u UserRef
	if err := r.db.Where("username = ?", username).First(&u).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &u, nil
}

// ---------- Likes ----------

// ToggleLike flips a like row and bumps/decrements the denormalized count on
// the target in one transaction. Returns the new liked state and count.
func (r *Repository) ToggleLike(userID int64, targetType string, targetID int64) (liked bool, count int, err error) {
	err = r.db.Transaction(func(tx *gorm.DB) error {
		var existing Like
		lookupErr := tx.Where("user_id = ? AND target_type = ? AND target_id = ?",
			userID, targetType, targetID).First(&existing).Error

		if lookupErr == nil {
			// Already liked → unlike.
			if err := tx.Delete(&existing).Error; err != nil {
				return err
			}
			liked = false
		} else if errors.Is(lookupErr, gorm.ErrRecordNotFound) {
			// Not liked yet → create.
			if err := tx.Create(&Like{
				UserID:     userID,
				TargetType: targetType,
				TargetID:   targetID,
			}).Error; err != nil {
				return err
			}
			liked = true
		} else {
			return lookupErr
		}

		delta := -1
		if liked {
			delta = 1
		}

		switch targetType {
		case TargetTopic:
			if err := tx.Model(&Topic{}).Where("id = ?", targetID).
				UpdateColumn("like_count", gorm.Expr("like_count + ?", delta)).Error; err != nil {
				return err
			}
			var t Topic
			if err := tx.Select("like_count").Where("id = ?", targetID).First(&t).Error; err != nil {
				return err
			}
			count = t.LikeCount
		case TargetPost:
			if err := tx.Model(&Post{}).Where("id = ?", targetID).
				UpdateColumn("like_count", gorm.Expr("like_count + ?", delta)).Error; err != nil {
				return err
			}
			var p Post
			if err := tx.Select("like_count").Where("id = ?", targetID).First(&p).Error; err != nil {
				return err
			}
			count = p.LikeCount
		}
		return nil
	})
	return
}

// LikedTargets returns the set of (targetType, targetID) the user has liked
// among the given ids. Used to hydrate user-specific state on list responses.
func (r *Repository) LikedTargets(userID int64, targetType string, ids []int64) (map[int64]bool, error) {
	out := make(map[int64]bool, len(ids))
	if userID == 0 || len(ids) == 0 {
		return out, nil
	}
	var likes []Like
	err := r.db.Where("user_id = ? AND target_type = ? AND target_id IN ?",
		userID, targetType, ids).Find(&likes).Error
	if err != nil {
		return nil, err
	}
	for _, l := range likes {
		out[l.TargetID] = true
	}
	return out, nil
}

// ---------- Bookmarks ----------

func (r *Repository) ToggleBookmark(userID, topicID int64) (bookmarked bool, err error) {
	err = r.db.Transaction(func(tx *gorm.DB) error {
		var existing Bookmark
		lookupErr := tx.Where("user_id = ? AND topic_id = ?", userID, topicID).First(&existing).Error

		if lookupErr == nil {
			if err := tx.Delete(&existing).Error; err != nil {
				return err
			}
			bookmarked = false
			return nil
		}
		if errors.Is(lookupErr, gorm.ErrRecordNotFound) {
			if err := tx.Create(&Bookmark{UserID: userID, TopicID: topicID}).Error; err != nil {
				return err
			}
			bookmarked = true
			return nil
		}
		return lookupErr
	})
	return
}

func (r *Repository) IsBookmarked(userID, topicID int64) (bool, error) {
	if userID == 0 {
		return false, nil
	}
	var count int64
	err := r.db.Model(&Bookmark{}).
		Where("user_id = ? AND topic_id = ?", userID, topicID).
		Count(&count).Error
	return count > 0, err
}

// ---------- Posts ----------

func (r *Repository) PostsByTopic(topicID int64) ([]Post, error) {
	var items []Post
	err := r.db.Preload("User").Preload("Bot").
		Where("topic_id = ? AND deleted_at IS NULL", topicID).
		Order("floor ASC").Find(&items).Error
	return items, err
}

// CreatePost atomically assigns the next floor number, writes the post, and
// bumps the parent topic's reply_count + last_post_at.
func (r *Repository) CreatePost(p *Post) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		var maxFloor int
		if err := tx.Model(&Post{}).
			Where("topic_id = ?", p.TopicID).
			Select("COALESCE(MAX(floor), 1)").
			Scan(&maxFloor).Error; err != nil {
			return err
		}
		p.Floor = maxFloor + 1
		if err := tx.Create(p).Error; err != nil {
			return err
		}
		now := time.Now()
		return tx.Model(&Topic{}).Where("id = ?", p.TopicID).Updates(map[string]interface{}{
			"reply_count":  gorm.Expr("reply_count + 1"),
			"last_post_at": now,
		}).Error
	})
}
