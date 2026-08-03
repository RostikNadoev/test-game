package services

import (
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"tg-lobbies-base/internal/models"
	"tg-lobbies-base/internal/testdb"

	"gorm.io/gorm"
)

func seedWithdrawalEligibility(t *testing.T, db *gorm.DB, userID uint, address string) {
	t.Helper()
	startedAt := time.Now().UTC().Add(-2 * time.Hour)
	deposit := models.WalletTransaction{
		UserID: userID, Type: "deposit", Currency: "game", Amount: 50, Status: "completed",
		Meta: fmt.Sprintf(`{"wallet_address":%q}`, address), CreatedAt: startedAt,
	}
	if err := db.Create(&deposit).Error; err != nil {
		t.Fatalf("create deposit transaction: %v", err)
	}
	for index := 0; index < MinimumWithdrawalGames; index++ {
		round := models.SoloRound{
			ID: fmt.Sprintf("withdrawal-round-%d-%d", userID, index), UserID: userID,
			Game: "fruit-cascade", BetCoins: 5, Status: models.SoloRoundStatusSettled,
			CreatedAt: startedAt.Add(time.Duration(index+1) * time.Minute),
		}
		if err := db.Create(&round).Error; err != nil {
			t.Fatalf("create solo round: %v", err)
		}
	}
}

func TestCreateAndCompleteWithdrawal(t *testing.T) {
	db := testdb.Open(t)
	testdb.SeedUser(t, db, 1, 100)
	address := "EQ" + strings.Repeat("A", 46)
	seedWithdrawalEligibility(t, db, 1, address)

	created, err := CreateWithdrawal(db, 1, 25, address, "request_key_001")
	if err != nil {
		t.Fatalf("create withdrawal: %v", err)
	}
	if created.Existing {
		t.Fatal("first request must not be marked existing")
	}
	if created.BalanceGame != 75 {
		t.Fatalf("balance = %.2f, want 75", created.BalanceGame)
	}
	if got := FormatTONNano(created.Details.Request.TonNanoAmount); got != "2.5" {
		t.Fatalf("ton amount = %s, want 2.5", got)
	}

	replayed, err := CreateWithdrawal(db, 1, 25, address, "request_key_001")
	if err != nil {
		t.Fatalf("replay withdrawal: %v", err)
	}
	if !replayed.Existing || replayed.Details.Request.ID != created.Details.Request.ID {
		t.Fatal("idempotent replay did not return the original request")
	}
	if user := testdb.ReloadUser(t, db, 1); user.BalanceGame != 75 {
		t.Fatalf("balance after replay = %.2f, want 75", user.BalanceGame)
	}

	completed, err := CompleteWithdrawal(db, created.Details.Request.ID)
	if err != nil {
		t.Fatalf("complete withdrawal: %v", err)
	}
	if completed.Request.Status != models.WithdrawalStatusCompleted || completed.Request.CompletedAt == nil {
		t.Fatalf("unexpected completed request: %+v", completed.Request)
	}

	var walletTx models.WalletTransaction
	if err := db.First(&walletTx, completed.Request.WalletTransactionID).Error; err != nil {
		t.Fatalf("load wallet transaction: %v", err)
	}
	if walletTx.Status != models.WithdrawalStatusCompleted || walletTx.Amount != -25 {
		t.Fatalf("unexpected wallet transaction: %+v", walletTx)
	}
}

func TestCreateWithdrawalRejectsInsufficientBalance(t *testing.T) {
	db := testdb.Open(t)
	testdb.SeedUser(t, db, 1, 10)
	address := "EQ" + strings.Repeat("A", 46)
	seedWithdrawalEligibility(t, db, 1, address)

	_, err := CreateWithdrawal(db, 1, 11, address, "request_key_002")
	if !errors.Is(err, ErrInsufficientBalance) {
		t.Fatalf("error = %v, want ErrInsufficientBalance", err)
	}
	if user := testdb.ReloadUser(t, db, 1); user.BalanceGame != 10 {
		t.Fatalf("balance changed after rejected request: %.2f", user.BalanceGame)
	}
}

func TestCreateWithdrawalRejectsLockedAccount(t *testing.T) {
	db := testdb.Open(t)
	testdb.SeedUser(t, db, 1, 100)
	address := "EQ" + strings.Repeat("A", 46)

	_, err := CreateWithdrawal(db, 1, 10, address, "request_key_003")
	var lockedErr *WithdrawalLockedError
	if !errors.As(err, &lockedErr) {
		t.Fatalf("error = %v, want WithdrawalLockedError", err)
	}
	if lockedErr.Eligibility.Eligible || lockedErr.Eligibility.WalletVerified {
		t.Fatalf("unexpected eligibility: %+v", lockedErr.Eligibility)
	}
	if user := testdb.ReloadUser(t, db, 1); user.BalanceGame != 100 {
		t.Fatalf("balance changed after locked request: %.2f", user.BalanceGame)
	}
}

func TestWithdrawalEligibilityTracksPendingRequest(t *testing.T) {
	db := testdb.Open(t)
	testdb.SeedUser(t, db, 1, 100)
	address := "EQ" + strings.Repeat("A", 46)
	seedWithdrawalEligibility(t, db, 1, address)

	before, err := CheckWithdrawalEligibility(db, 1, address)
	if err != nil || !before.Eligible {
		t.Fatalf("eligibility before request = %+v, err=%v", before, err)
	}
	if _, err := CreateWithdrawal(db, 1, 10, address, "request_key_004"); err != nil {
		t.Fatalf("create withdrawal: %v", err)
	}
	after, err := CheckWithdrawalEligibility(db, 1, address)
	if err != nil {
		t.Fatalf("eligibility after request: %v", err)
	}
	if after.Eligible || after.NoPendingWithdrawal {
		t.Fatalf("pending request did not lock withdrawal: %+v", after)
	}
}
