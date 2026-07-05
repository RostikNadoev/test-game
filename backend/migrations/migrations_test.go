package migrations_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestBaselineMigrationDefinesAllTables(t *testing.T) {
	t.Helper()

	path := filepath.Join("001_baseline.sql")
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read baseline: %v", err)
	}

	required := []string{
		"users",
		"user_stats",
		"user_solo_stats",
		"wallet_transactions",
		"bet_reservations",
		"matches",
		"match_finish_votes",
		"lobby_records",
		"lobby_player_records",
		"solo_rounds",
		"solo_sessions",
	}

	content := strings.ToLower(string(raw))
	for _, table := range required {
		needle := "create table if not exists " + table
		if !strings.Contains(content, needle) {
			t.Fatalf("baseline missing table definition: %s", table)
		}
	}

	if !strings.Contains(content, "idx_solo_round_user_idempotency") {
		t.Fatal("baseline missing composite idempotency index for solo_rounds")
	}
	if strings.Contains(content, "idempotency_key text unique") {
		t.Fatal("baseline should not use global unique idempotency_key")
	}
}
