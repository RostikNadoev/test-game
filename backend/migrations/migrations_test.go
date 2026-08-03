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

func TestWithdrawalMigrationDefinesRequestTable(t *testing.T) {
	path := filepath.Join("003_withdrawals.sql")
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read withdrawal migration: %v", err)
	}
	content := strings.ToLower(string(raw))
	for _, required := range []string{
		"create table if not exists withdrawal_requests",
		"unique (user_id, idempotency_key)",
		"ton_nano_amount bigint not null",
	} {
		if !strings.Contains(content, required) {
			t.Fatalf("withdrawal migration missing: %s", required)
		}
	}
}

func TestPvpMinimumBetMigration(t *testing.T) {
	path := filepath.Join("004_pvp_min_bet.sql")
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read pvp minimum bet migration: %v", err)
	}
	content := strings.ToLower(string(raw))
	for _, required := range []string{
		"update game_settings",
		"set min_bet = 2",
		"where kind = 'pvp'",
	} {
		if !strings.Contains(content, required) {
			t.Fatalf("pvp minimum bet migration missing: %s", required)
		}
	}
}

func TestReferralMigrationDefinesUniqueAttribution(t *testing.T) {
	path := filepath.Join("005_referrals.sql")
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read referral migration: %v", err)
	}
	content := strings.ToLower(string(raw))
	for _, required := range []string{
		"create table if not exists referral_profiles",
		"create table if not exists referrals",
		"referred_user_id bigint not null unique",
		"referrer_user_id <> referred_user_id",
	} {
		if !strings.Contains(content, required) {
			t.Fatalf("referral migration missing: %s", required)
		}
	}
}
