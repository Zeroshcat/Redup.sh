package forum

import "time"

// UserRef is a minimal view of the users table — just the fields needed to
// render author info on topics/posts. Lives in the forum package to avoid a
// cyclic dep on the user package.
type UserRef struct {
	ID       int64  `gorm:"primaryKey" json:"id"`
	Username string `json:"username"`
	Level    int16  `json:"level"`
	Role     string `json:"role"`
	Status   string `json:"status,omitempty"`
}

func (UserRef) TableName() string { return "users" }

type Category struct {
	ID           int64     `gorm:"primaryKey" json:"id"`
	Name         string    `gorm:"size:64;not null" json:"name"`
	Slug         string    `gorm:"size:64;uniqueIndex;not null" json:"slug"`
	Description  string    `gorm:"size:512" json:"description"`
	Type         string    `gorm:"size:16;default:'normal'" json:"type"` // normal/anon/bot
	SortOrder    int       `gorm:"default:0" json:"sort_order"`
	TopicCount   int       `gorm:"default:0" json:"topic_count"`
	PostCooldown int       `gorm:"default:0" json:"post_cooldown"`
	AllowBot     bool      `gorm:"default:true" json:"allow_bot"`
	// Rules is the board-specific markdown text that gets appended to the
	// global site rules when moderating this category, and shown on the
	// category landing page as a collapsible rules banner. Empty means
	// "no board-specific rules beyond the global rules".
	Rules     string    `gorm:"type:text" json:"rules,omitempty"`
	CreatedAt time.Time `gorm:"autoCreateTime" json:"created_at"`
}

func (Category) TableName() string { return "categories" }

type Topic struct {
	ID             int64      `gorm:"primaryKey" json:"id"`
	CategoryID     int64      `gorm:"index:idx_topics_cat_deleted;not null" json:"category_id"`
	CategorySlug   string     `gorm:"-" json:"category_slug,omitempty"`
	CategoryName   string     `gorm:"-" json:"category_name,omitempty"`
	UserID         int64      `gorm:"index;not null" json:"user_id"`
	User           *UserRef   `gorm:"foreignKey:UserID;references:ID" json:"user,omitempty"`
	Title          string     `gorm:"size:256;not null" json:"title"`
	Body           string     `gorm:"type:text" json:"body,omitempty"`
	Excerpt        string     `gorm:"size:512" json:"excerpt,omitempty"`
	IsAnon         bool       `gorm:"default:false" json:"is_anon"`
	TopicAnonID    string     `gorm:"column:anon_id;size:64" json:"anon_id,omitempty"`
	PinLevel       int16      `gorm:"default:0" json:"pin_level"`
	PinWeight      int        `gorm:"default:0" json:"pin_weight"`
	IsLocked       bool       `gorm:"default:false" json:"is_locked"`
	IsFeatured     bool       `gorm:"default:false" json:"is_featured"`
	ViewCount      int        `gorm:"default:0" json:"view_count"`
	ReplyCount     int        `gorm:"default:0" json:"reply_count"`
	LikeCount      int        `gorm:"default:0" json:"like_count"`
	LastPostAt     time.Time  `json:"last_post_at"`
	CreatedAt      time.Time  `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt      time.Time  `gorm:"autoUpdateTime" json:"updated_at"`
	EditedAt       *time.Time `json:"edited_at,omitempty"`
	// MinReadLevel gates who can read the topic body + replies. 0 means
	// anyone. Enforced client-side for now (soft limit) — the author can
	// set it up to their own level at creation, and the frontend hides
	// the body when the viewer's level is too low.
	MinReadLevel int16      `gorm:"default:0" json:"min_read_level"`
	DeletedAt    *time.Time `gorm:"index:idx_topics_cat_deleted" json:"-"`

	// Transient per-request user state, never persisted. Handlers fill these
	// when the caller is authenticated so the frontend can render "已赞/已收藏".
	UserLiked      bool `gorm:"-" json:"user_liked,omitempty"`
	UserBookmarked bool `gorm:"-" json:"user_bookmarked,omitempty"`
}

func (Topic) TableName() string { return "topics" }

type Post struct {
	ID             int64      `gorm:"primaryKey" json:"id"`
	TopicID        int64      `gorm:"index:idx_posts_topic_deleted;not null" json:"topic_id"`
	UserID         int64      `gorm:"index;not null" json:"user_id"`
	User           *UserRef   `gorm:"foreignKey:UserID;references:ID" json:"user,omitempty"`
	Floor          int        `gorm:"not null" json:"floor"`
	Content        string     `gorm:"type:text;not null" json:"content"`
	IsAnon         bool       `gorm:"default:false" json:"is_anon"`
	AnonID         string     `gorm:"size:64" json:"anon_id,omitempty"`
	ParentID       *int64     `json:"parent_id,omitempty"`
	ReplyToFloor   *int       `json:"reply_to_floor,omitempty"`
	LikeCount      int        `gorm:"default:0" json:"like_count"`
	IsBotGenerated bool       `gorm:"default:false" json:"is_bot_generated"`
	BotID          *int64     `json:"bot_id,omitempty"`
	Bot            *BotRef    `gorm:"foreignKey:BotID;references:ID" json:"bot,omitempty"`
	CreatedAt      time.Time  `gorm:"autoCreateTime" json:"created_at"`
	EditedAt       *time.Time `json:"edited_at,omitempty"`
	DeletedAt      *time.Time `gorm:"index:idx_posts_topic_deleted" json:"-"`

	UserLiked bool `gorm:"-" json:"user_liked,omitempty"`
}

// BotRef is a minimal view of the bots table — kept here to avoid a cyclic
// dep on the bot package. The actual bot module owns the full schema; this
// view just lets GORM preload bot identity onto bot-generated posts.
type BotRef struct {
	ID            int64  `gorm:"primaryKey" json:"id"`
	Slug          string `json:"slug"`
	Name          string `json:"name"`
	AvatarURL     string `json:"avatar_url,omitempty"`
	ModelProvider string `json:"model_provider"`
	ModelName     string `json:"model_name"`
}

func (BotRef) TableName() string { return "bots" }

func (Post) TableName() string { return "posts" }
