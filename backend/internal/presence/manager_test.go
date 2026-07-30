package presence

import (
	"testing"
	"time"
)

func TestManagerCountsUniqueActiveUsers(t *testing.T) {
	now := time.Date(2026, time.July, 31, 12, 0, 0, 0, time.UTC)
	manager := NewManager()
	manager.now = func() time.Time { return now }

	if count := manager.Touch(1); count != 1 {
		t.Fatalf("Touch(1) count = %d, want 1", count)
	}
	if count := manager.Touch(1); count != 1 {
		t.Fatalf("second Touch(1) count = %d, want 1", count)
	}
	if count := manager.Touch(2); count != 2 {
		t.Fatalf("Touch(2) count = %d, want 2", count)
	}

	now = now.Add(defaultTTL + time.Millisecond)
	if count := manager.Count(); count != 0 {
		t.Fatalf("expired count = %d, want 0", count)
	}
}
