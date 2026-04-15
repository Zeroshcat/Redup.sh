package translation

import "time"

// CacheEntry stores a translated piece of text keyed by SHA-256(source||lang)
// so identical content + target language only ever costs one LLM call.
type CacheEntry struct {
	ID         int64     `gorm:"primaryKey" json:"id"`
	Hash       string    `gorm:"size:64;uniqueIndex;not null" json:"hash"`
	TargetLang string    `gorm:"size:8;not null" json:"target_lang"`
	Provider   string    `gorm:"size:32" json:"provider"`
	Model      string    `gorm:"size:64" json:"model"`
	Translated string    `gorm:"type:text;not null" json:"translated"`
	CreatedAt  time.Time `gorm:"autoCreateTime" json:"created_at"`
}

func (CacheEntry) TableName() string { return "translation_cache" }
