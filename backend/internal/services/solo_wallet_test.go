package services

import (
	"testing"
	"time"

	"tg-lobbies-base/internal/models"
	"tg-lobbies-base/internal/testdb"
)

func TestSoloSpinDebitsBet(t *testing.T) {
	db := testdb.Open(t)
	testdb.SeedUser(t, db, 1, 100)

	result, err := SoloSpin(db, 1, "neon_scratch", 10, "")
	if err != nil {
		t.Fatalf("spin: %v", err)
	}

	user := testdb.ReloadUser(t, db, 1)
	expected := roundMoney(100 - 10 + result.PayoutCoins)
	if user.BalanceGame != expected {
		t.Fatalf("balance = %.2f, want %.2f", user.BalanceGame, expected)
	}
	if result.BetCoins != 10 {
		t.Fatalf("bet = %.2f, want 10", result.BetCoins)
	}
}

func TestSoloSpinInsufficientBalance(t *testing.T) {
	db := testdb.Open(t)
	testdb.SeedUser(t, db, 1, 5)

	_, err := SoloSpin(db, 1, "neon_scratch", 10, "")
	if err != ErrInsufficientBalance {
		t.Fatalf("expected ErrInsufficientBalance, got %v", err)
	}
}

func TestSoloSpinIdempotency(t *testing.T) {
	db := testdb.Open(t)
	testdb.SeedUser(t, db, 1, 100)

	first, err := SoloSpin(db, 1, "neon_scratch", 10, "idem-1")
	if err != nil {
		t.Fatalf("first spin: %v", err)
	}
	second, err := SoloSpin(db, 1, "neon_scratch", 10, "idem-1")
	if err != nil {
		t.Fatalf("second spin: %v", err)
	}
	if first.RoundID != second.RoundID {
		t.Fatalf("round ids differ: %s vs %s", first.RoundID, second.RoundID)
	}

	user := testdb.ReloadUser(t, db, 1)
	expected := roundMoney(100 - 10 + first.PayoutCoins)
	if user.BalanceGame != expected {
		t.Fatalf("balance after idempotent replay = %.2f, want %.2f", user.BalanceGame, expected)
	}
}

func TestStartSessionCashout(t *testing.T) {
	db := testdb.Open(t)
	testdb.SeedUser(t, db, 1, 100)

	start, err := StartSoloSession(db, 1, "royal_5x5", 10)
	if err != nil {
		t.Fatalf("start session: %v", err)
	}

	user := testdb.ReloadUser(t, db, 1)
	if user.BalanceGame != 90 {
		t.Fatalf("balance after start = %.2f, want 90", user.BalanceGame)
	}

	// Pick a safe cell on row 0 (retry columns until safe or bust).
	var step *SoloSessionResult
	for col := 0; col < 5; col++ {
		step, err = SoloSessionStep(db, 1, start.SessionID, "pick", map[string]any{
			"row": 0,
			"col": col,
		})
		if err != nil {
			t.Fatalf("step col %d: %v", col, err)
		}
		if step.Status == models.SoloSessionStatusActive {
			break
		}
		if step.Status == models.SoloSessionStatusBust {
			t.Skip("busted on first pick; retry test run")
		}
	}
	if step == nil || step.Status != models.SoloSessionStatusActive {
		t.Fatalf("expected active session after safe pick, got %+v", step)
	}

	cashout, err := CashoutSoloSession(db, 1, start.SessionID)
	if err != nil {
		t.Fatalf("cashout: %v", err)
	}
	if cashout.PayoutCoins <= 0 {
		t.Fatalf("expected positive payout, got %.2f", cashout.PayoutCoins)
	}

	user = testdb.ReloadUser(t, db, 1)
	expected := roundMoney(90 + cashout.PayoutCoins)
	if user.BalanceGame != expected {
		t.Fatalf("balance after cashout = %.2f, want %.2f", user.BalanceGame, expected)
	}
}

func TestExpireStaleSoloSessionsRefundsBet(t *testing.T) {
	db := testdb.Open(t)
	testdb.SeedUser(t, db, 1, 100)

	start, err := StartSoloSession(db, 1, "crystal_mines", 12)
	if err != nil {
		t.Fatalf("start session: %v", err)
	}

	cutoff := time.Now().UTC().Add(-time.Hour)
	if err := db.Model(&models.SoloSession{}).Where("id = ?", start.SessionID).
		Update("updated_at", cutoff).Error; err != nil {
		t.Fatalf("backdate session: %v", err)
	}

	if err := ExpireStaleSoloSessions(db, 30*time.Minute); err != nil {
		t.Fatalf("expire sessions: %v", err)
	}

	user := testdb.ReloadUser(t, db, 1)
	if user.BalanceGame != 100 {
		t.Fatalf("balance after expire refund = %.2f, want 100", user.BalanceGame)
	}

	var session models.SoloSession
	if err := db.First(&session, "id = ?", start.SessionID).Error; err != nil {
		t.Fatalf("reload session: %v", err)
	}
	if session.Status != models.SoloSessionStatusExpired {
		t.Fatalf("session status = %s, want expired", session.Status)
	}
}
