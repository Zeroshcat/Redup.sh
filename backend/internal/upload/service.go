package upload

import (
	"errors"
	"fmt"
	"io"
	"mime"
	"os"
	"path/filepath"
	"strings"
	"time"
)

var (
	ErrInvalidFile     = errors.New("invalid file")
	ErrFileTooLarge    = errors.New("file too large")
	ErrFileTypeBlocked = errors.New("file type not allowed")
	ErrUploadFailed    = errors.New("upload failed")
	ErrAttachNotFound  = errors.New("attachment not found")
	ErrNotOwner        = errors.New("not the file owner")
)

// Config holds the upload-related settings loaded from env / site settings.
type Config struct {
	// Directory on disk where uploaded files are stored.
	UploadDir string
	// MaxFileSize in bytes. Default 20 MiB.
	MaxFileSize int64
	// AllowedMIMETypes is an allowlist. Empty means allow all non-executable types.
	AllowedMIMETypes map[string]bool
}

// DefaultConfig returns sensible defaults for development.
func DefaultConfig() Config {
	return Config{
		UploadDir:    "./uploads",
		MaxFileSize:  20 << 20, // 20 MiB
		AllowedMIMETypes: map[string]bool{
			"image/jpeg":               true,
			"image/png":                true,
			"image/gif":                true,
			"image/webp":               true,
			"image/svg+xml":            true,
			"video/mp4":                true,
			"video/webm":               true,
			"video/quicktime":          true,
			"application/pdf":          true,
		},
	}
}

// Service handles file upload business logic.
type Service struct {
	repo   *Repository
	config Config
}

func NewService(repo *Repository, cfg Config) *Service {
	// Ensure upload directory exists.
	os.MkdirAll(cfg.UploadDir, 0o755)
	return &Service{repo: repo, config: cfg}
}

// UploadResult is returned after a successful upload.
type UploadResult struct {
	Attachment *Attachment
}

// Upload validates, stores the file on disk, and creates an Attachment record.
// The returned Attachment has a URL path suitable for serving via the /uploads route.
func (s *Service) Upload(userID int64, fileName string, fileSize int64, mimeType string, reader io.Reader) (*Attachment, error) {
	if userID == 0 {
		return nil, ErrInvalidFile
	}
	if fileSize <= 0 {
		return nil, ErrInvalidFile
	}
	if fileSize > s.config.MaxFileSize {
		return nil, ErrFileTooLarge
	}

	// Normalize and validate MIME type.
	mimeType = strings.ToLower(strings.Split(mimeType, ";")[0])
	if mimeType == "" {
		mimeType = mime.TypeByExtension(filepath.Ext(fileName))
	}
	if mimeType == "" {
		mimeType = "application/octet-stream"
	}
	if !s.isAllowedMIME(mimeType) {
		return nil, ErrFileTypeBlocked
	}

	// Generate a unique storage path: <uploadDir>/<yyyy-mm>/<unique-name>
	now := time.Now()
	dateDir := now.Format("2006-01")
	ext := filepath.Ext(fileName)
	if ext == "" {
		// Infer extension from MIME type.
		if exts, _ := mime.ExtensionsByType(mimeType); len(exts) > 0 {
			ext = exts[0]
		}
	}
	uniqueName := fmt.Sprintf("%d-%s%s", now.UnixMilli(), randomHex(8), ext)
	relPath := filepath.Join(dateDir, uniqueName)
	absPath := filepath.Join(s.config.UploadDir, relPath)

	// Create date subdirectory.
	dirPath := filepath.Join(s.config.UploadDir, dateDir)
	if err := os.MkdirAll(dirPath, 0o755); err != nil {
		return nil, fmt.Errorf("%w: mkdir: %v", ErrUploadFailed, err)
	}

	// Write file to disk.
	f, err := os.OpenFile(absPath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		return nil, fmt.Errorf("%w: create file: %v", ErrUploadFailed, err)
	}
	written, err := io.Copy(f, reader)
	f.Close()
	if err != nil {
		os.Remove(absPath) // cleanup partial write
		return nil, fmt.Errorf("%w: write: %v", ErrUploadFailed, err)
	}

	// Build URL path for serving.
	urlPath := "/uploads/" + filepath.ToSlash(relPath)

	a := &Attachment{
		UserID:      userID,
		FileName:    filepath.Base(fileName),
		FileSize:    written,
		MIMEType:    mimeType,
		StoragePath: relPath,
		URL:         urlPath,
	}
	if err := s.repo.Create(a); err != nil {
		os.Remove(absPath) // cleanup on DB error
		return nil, fmt.Errorf("%w: db: %v", ErrUploadFailed, err)
	}

	return a, nil
}

// AttachToTarget binds orphan attachments to a target entity (topic/post).
func (s *Service) AttachToTarget(ids []int64, targetType string, targetID int64, userID int64) error {
	return s.repo.AttachTarget(ids, targetType, targetID, userID)
}

// GetAttachments returns all attachments for a given target.
func (s *Service) GetAttachments(targetType string, targetID int64) ([]Attachment, error) {
	return s.repo.ByTarget(targetType, targetID)
}

// GetByIDs returns attachments by their IDs (for hydrating multiple targets).
func (s *Service) GetByIDs(ids []int64) ([]Attachment, error) {
	return s.repo.ByIDs(ids)
}

// Delete soft-deletes an attachment (owner or admin only).
func (s *Service) Delete(id int64, userID int64, isAdmin bool) error {
	a, err := s.repo.ByID(id)
	if err != nil {
		return err
	}
	if a == nil {
		return ErrAttachNotFound
	}
	if !isAdmin && a.UserID != userID {
		return ErrNotOwner
	}
	return s.repo.SoftDelete(id)
}

func (s *Service) isAllowedMIME(mimeType string) bool {
	if len(s.config.AllowedMIMETypes) == 0 {
		// Block executable types even with empty allowlist.
		switch mimeType {
		case "application/x-executable", "application/x-dosexec",
			"application/x-shellscript", "application/x-msdos-program":
			return false
		}
		return true
	}
	return s.config.AllowedMIMETypes[mimeType]
}

// ServeFile returns the absolute filesystem path for serving a file by its
// URL path. Returns empty string if not found.
func (s *Service) ServeFile(urlPath string) string {
	// urlPath looks like "/uploads/2026-01/1234567890-abcd1234.jpg"
	relPath := strings.TrimPrefix(urlPath, "/uploads/")
	absPath := filepath.Join(s.config.UploadDir, relPath)
	// Security: ensure the resolved path is within UploadDir.
	if !strings.HasPrefix(filepath.Clean(absPath), filepath.Clean(s.config.UploadDir)) {
		return ""
	}
	if _, err := os.Stat(absPath); err != nil {
		return ""
	}
	return absPath
}

// randomHex generates a short hex string for unique file naming.
func randomHex(n int) string {
	b := make([]byte, n)
	// Simple fast random using timestamp and counter — not crypto-grade.
	now := time.Now().UnixNano()
	for i := range b {
		b[i] = "0123456789abcdef"[(now+int64(i*31))%16]
	}
	return fmt.Sprintf("%x", b)[:n]
}
