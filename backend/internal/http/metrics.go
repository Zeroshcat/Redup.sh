package http

import (
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// Prometheus metrics are registered globally so a restart of the gin
// handler doesn't leak a duplicate collector. The label cardinality is
// kept modest — (method, route, status) for a small app is fine, but
// watch out for route blowup if we ever add a lot of dynamic paths;
// MustRegister against a LabelPairs with user ids or topic slugs would
// blow up the series count quickly.
var (
	httpRequestsTotal = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "redup_http_requests_total",
			Help: "Total number of HTTP requests processed, partitioned by method, route, and response code.",
		},
		[]string{"method", "route", "status"},
	)
	httpRequestDuration = prometheus.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "redup_http_request_duration_seconds",
			Help:    "HTTP request latency in seconds.",
			Buckets: []float64{0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5},
		},
		[]string{"method", "route"},
	)
)

func init() {
	prometheus.MustRegister(httpRequestsTotal, httpRequestDuration)
}

// Metrics is a gin middleware that records request count and latency.
// It uses c.FullPath() (the registered route template) rather than
// c.Request.URL.Path so topic ids and other path params collapse into a
// single series per route. Unmatched routes get recorded as "unmatched"
// so a 404 flood can't blow up cardinality.
func Metrics() gin.HandlerFunc {
	return func(c *gin.Context) {
		started := time.Now()
		c.Next()
		route := c.FullPath()
		if route == "" {
			route = "unmatched"
		}
		status := strconv.Itoa(c.Writer.Status())
		httpRequestsTotal.WithLabelValues(c.Request.Method, route, status).Inc()
		httpRequestDuration.WithLabelValues(c.Request.Method, route).Observe(time.Since(started).Seconds())
	}
}

// MetricsHandler exposes /metrics in the Prometheus text format. Mount
// it on the root router before any auth middleware so scrapers can
// reach it without credentials. If you want to restrict access, put it
// behind an IP allowlist in your ingress — keeping Go-side open is the
// common pattern so scraping just works.
func MetricsHandler() gin.HandlerFunc {
	h := promhttp.Handler()
	return func(c *gin.Context) {
		h.ServeHTTP(c.Writer, c.Request)
	}
}
