package http

import (
	"log"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// Envelope is the single shape returned by every API endpoint.
// Exactly one of Data or Error is populated.
type Envelope struct {
	Data  interface{} `json:"data,omitempty"`
	Error *APIError   `json:"error,omitempty"`
}

type APIError struct {
	Code      string      `json:"code"`
	Message   string      `json:"message"`
	RequestID string      `json:"request_id,omitempty"`
	Data      interface{} `json:"data,omitempty"`
}

// Stable machine-readable error codes. Frontend branches on these, never on
// the human-readable message. Keep the set small and meaningful.
const (
	CodeBadRequest        = "bad_request"
	CodeUnauthorized      = "unauthorized"
	CodeForbidden         = "forbidden"
	CodeNotFound          = "not_found"
	CodeConflict          = "conflict"
	CodeValidation        = "validation_error"
	CodeInternal          = "internal_error"
	CodeTokenInvalid      = "token_invalid"
	CodeTokenExpired      = "token_expired"
	CodeUsernameTaken     = "username_taken"
	CodeEmailTaken        = "email_taken"
	CodeInvalidUsername   = "invalid_username"
	CodeInvalidEmail      = "invalid_email"
	CodeWeakPassword      = "weak_password"
	CodeInvalidCredential = "invalid_credential"
	CodeAccountDisabled   = "account_disabled"
	CodeRateLimited       = "rate_limited"
)

// OK writes a 200 success response with data.
func OK(c *gin.Context, data interface{}) {
	c.JSON(http.StatusOK, Envelope{Data: data})
}

// Created writes a 201 success response with data.
func Created(c *gin.Context, data interface{}) {
	c.JSON(http.StatusCreated, Envelope{Data: data})
}

// NoContent writes 200 with a simple ok payload.
func NoContent(c *gin.Context) {
	c.JSON(http.StatusOK, Envelope{Data: gin.H{"ok": true}})
}

// Fail writes an error response with HTTP status, stable code, and message.
// The current request id is attached automatically so the client can reference
// the exact server log line when reporting a bug.
func Fail(c *gin.Context, status int, code, message string) {
	c.AbortWithStatusJSON(status, Envelope{
		Error: &APIError{
			Code:      code,
			Message:   message,
			RequestID: GetRequestID(c),
		},
	})
}

// FailWith is Fail plus a structured data payload — used when a client
// needs more than a string to recover (e.g. a moderation rewrite
// suggestion, validation details for a multi-field form).
func FailWith(c *gin.Context, status int, code, message string, data interface{}) {
	c.AbortWithStatusJSON(status, Envelope{
		Error: &APIError{
			Code:      code,
			Message:   message,
			RequestID: GetRequestID(c),
			Data:      data,
		},
	})
}

func BadRequest(c *gin.Context, message string) {
	Fail(c, http.StatusBadRequest, CodeBadRequest, message)
}

func ValidationError(c *gin.Context, code, message string) {
	Fail(c, http.StatusBadRequest, code, message)
}

func Unauthorized(c *gin.Context, message string) {
	Fail(c, http.StatusUnauthorized, CodeUnauthorized, message)
}

func Forbidden(c *gin.Context, message string) {
	Fail(c, http.StatusForbidden, CodeForbidden, message)
}

func NotFound(c *gin.Context, message string) {
	Fail(c, http.StatusNotFound, CodeNotFound, message)
}

func Conflict(c *gin.Context, code, message string) {
	Fail(c, http.StatusConflict, code, message)
}

// Internal writes a 500. The caller's detail string is logged server-side
// with the request id for grep-ability but NEVER returned to the client —
// DB errors, connection string fragments, and internal paths routinely
// end up in these messages and would leak to the world if we echoed them.
// The client gets a generic fixed string plus the request id so they can
// still reference the exact log line in a bug report.
func Internal(c *gin.Context, detail string) {
	if detail != "" {
		log.Printf("[internal] req=%s path=%s err=%s", GetRequestID(c), c.Request.URL.Path, detail)
	}
	Fail(c, http.StatusInternalServerError, CodeInternal, "internal server error")
}

func TooManyRequests(c *gin.Context, message string) {
	Fail(c, http.StatusTooManyRequests, CodeRateLimited, message)
}

// AtoiOr parses s as an integer. Returns def when s is empty or not a valid
// integer. Shared by handler packages to avoid per-package duplication.
func AtoiOr(s string, def int) int {
	if s == "" {
		return def
	}
	n, err := strconv.Atoi(s)
	if err != nil {
		return def
	}
	return n
}
