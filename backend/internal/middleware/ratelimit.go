package middleware

import (
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

type rateLimiter struct {
	mu       sync.Mutex
	entries  map[string][]time.Time
	limit    int
	window   time.Duration
}

func newRateLimiter(limit int, window time.Duration) *rateLimiter {
	return &rateLimiter{
		entries: make(map[string][]time.Time),
		limit:   limit,
		window:  window,
	}
}

func (r *rateLimiter) allow(key string) bool {
	now := time.Now()

	r.mu.Lock()
	defer r.mu.Unlock()

	times := r.entries[key]
	cutoff := now.Add(-r.window)
	kept := times[:0]
	for _, t := range times {
		if t.After(cutoff) {
			kept = append(kept, t)
		}
	}
	times = kept

	if len(times) >= r.limit {
		r.entries[key] = times
		return false
	}

	times = append(times, now)
	r.entries[key] = times
	return true
}

func RateLimit(limit int, window time.Duration) gin.HandlerFunc {
	limiter := newRateLimiter(limit, window)

	return func(c *gin.Context) {
		key := c.ClientIP()
		if !limiter.allow(key) {
			c.JSON(http.StatusTooManyRequests, gin.H{"error": "rate limit exceeded"})
			c.Abort()
			return
		}
		c.Next()
	}
}
