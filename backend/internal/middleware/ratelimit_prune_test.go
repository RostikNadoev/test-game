package middleware

import (
	"testing"
	"time"
)

func TestRateLimiterPrunesStaleKeysWithoutReuse(t *testing.T) {
	limiter := newRateLimiter(5, 50*time.Millisecond)
	frozen := time.Date(2026, 7, 5, 12, 0, 0, 0, time.UTC)
	limiter.now = func() time.Time { return frozen }
	limiter.lastFullPrune = frozen

	if !limiter.allow("one-off-key") {
		t.Fatal("expected first request to pass")
	}
	if len(limiter.entries) != 1 {
		t.Fatalf("entries = %d, want 1", len(limiter.entries))
	}

	limiter.now = func() time.Time { return frozen.Add(2 * limiter.window) }
	limiter.callsSincePrune = 64

	if !limiter.allow("fresh-key") {
		t.Fatal("expected fresh request to pass")
	}
	if _, ok := limiter.entries["one-off-key"]; ok {
		t.Fatal("stale key should be pruned without being hit again")
	}
	if _, ok := limiter.entries["fresh-key"]; !ok {
		t.Fatal("fresh key should remain tracked")
	}
}

func TestRateLimitByUserUsesUserKey(t *testing.T) {
	limiter := newRateLimiter(1, time.Minute)
	if !limiter.allow("user:42") {
		t.Fatal("expected first user request to pass")
	}
	if limiter.allow("user:42") {
		t.Fatal("expected second user request to be blocked")
	}
	if !limiter.allow("user:43") {
		t.Fatal("expected different user key to pass")
	}
}
