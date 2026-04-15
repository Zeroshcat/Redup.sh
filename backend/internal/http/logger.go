package http

import (
	"encoding/json"
	"log"
	"os"
	"time"

	"github.com/gin-gonic/gin"
)

// logFormat toggles between a pretty text format for local dev (gin mode
// "debug") and a one-line JSON format for production log aggregators.
// Controlled via LOG_FORMAT env var, falling back to text in dev and
// json when GIN_MODE is release so the default is "do the right thing"
// without forcing an env var into every compose file.
var logFormat = func() string {
	if v := os.Getenv("LOG_FORMAT"); v != "" {
		return v
	}
	if os.Getenv("GIN_MODE") == "release" {
		return "json"
	}
	return "text"
}()

// Logger middleware emits one record per request. Text format for local
// dev (easy to read), JSON format for prod (easy to ship into ELK /
// Datadog / Loki without a parsing rule).
func Logger() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		path := c.Request.URL.Path
		if raw := c.Request.URL.RawQuery; raw != "" {
			path = path + "?" + raw
		}

		c.Next()

		latency := time.Since(start)
		status := c.Writer.Status()
		rid := GetRequestID(c)

		if logFormat == "json" {
			rec := map[string]interface{}{
				"ts":         time.Now().UTC().Format(time.RFC3339Nano),
				"level":      levelForStatus(status),
				"msg":        "http",
				"method":     c.Request.Method,
				"path":       path,
				"status":     status,
				"latency_ms": latency.Milliseconds(),
				"req_id":     rid,
				"ip":         c.ClientIP(),
				"ua":         c.Request.UserAgent(),
			}
			if b, err := json.Marshal(rec); err == nil {
				// Direct stdout write — `log.Printf` would prepend a
				// timestamp and sometimes a file:line prefix which
				// corrupts the JSON object shape parsers expect.
				os.Stdout.Write(b)
				os.Stdout.Write([]byte{'\n'})
			}
			return
		}

		log.Printf("[HTTP] %3d %-6s %-40s %9s  req=%s ip=%s",
			status,
			c.Request.Method,
			path,
			latency.Truncate(time.Microsecond),
			rid,
			c.ClientIP(),
		)
	}
}

// levelForStatus classifies HTTP status codes into a level field suitable
// for log aggregators that index on severity. 5xx → error, 4xx → warn,
// everything else → info.
func levelForStatus(status int) string {
	switch {
	case status >= 500:
		return "error"
	case status >= 400:
		return "warn"
	default:
		return "info"
	}
}
