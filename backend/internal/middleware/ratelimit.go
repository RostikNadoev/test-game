package middleware

import (
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

type rateLimiter struct {
	mu              sync.Mutex
	entries         map[string][]time.Time
	limit           int
	window          time.Duration
	callsSincePrune int
	lastFullPrune   time.Time
	now             func() time.Time
}

func newRateLimiter(limit int, window time.Duration) *rateLimiter {
	now := time.Now()
	return &rateLimiter{
		entries:       make(map[string][]time.Time),
		limit:         limit,
		window:        window,
		lastFullPrune: now,
		now:           time.Now,
	}
}

func (r *rateLimiter) pruneStaleLocked(now time.Time) {
	cutoff := now.Add(-r.window)
	for key, times := range r.entries {
		kept := times[:0]
		for _, t := range times {
			if t.After(cutoff) {
				kept = append(kept, t)
			}
		}
		if len(kept) == 0 {
			delete(r.entries, key)
		} else {
			r.entries[key] = kept
		}
	}
}

func (r *rateLimiter) maybePruneAllLocked(now time.Time) {
	r.callsSincePrune++
	if r.callsSincePrune < 64 && now.Sub(r.lastFullPrune) < r.window {
		return
	}
	r.pruneStaleLocked(now)
	r.callsSincePrune = 0
	r.lastFullPrune = now
}

func (r *rateLimiter) allow(key string) bool {
	now := r.now()

	r.mu.Lock()
	defer r.mu.Unlock()

	r.maybePruneAllLocked(now)

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
		if len(times) == 0 {
			delete(r.entries, key)
		} else {
			r.entries[key] = times
		}
		return false
	}

	times = append(times, now)
	if len(times) == 0 {
		delete(r.entries, key)
	} else {
		r.entries[key] = times
	}
	return true
}

// RateLimit stores counters in process memory (single-instance only).
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

func RateLimitByUser(limit int, window time.Duration) gin.HandlerFunc {
	limiter := newRateLimiter(limit, window)

	return func(c *gin.Context) {
		userID := UserID(c)
		key := c.ClientIP()
		if userID > 0 {
			key = "user:" + strconv.FormatUint(uint64(userID), 10)
		}
		if !limiter.allow(key) {
			c.JSON(http.StatusTooManyRequests, gin.H{"error": "rate limit exceeded"})
			c.Abort()
			return
		}
		c.Next()
	}
}