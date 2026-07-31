package services

import (
	"errors"
	"strings"
	"testing"

	"tg-lobbies-base/internal/models"
	"tg-lobbies-base/internal/testdb"
)

func TestCreateAndCompleteWithdrawal(t *testing.T) {
	db := testdb.Open(t)
	testdb.SeedUser(t, db, 1, 100)
	address := "EQ" + strings.Repeat("A", 46)

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

	_, err := CreateWithdrawal(db, 1, 11, address, "request_key_002")
	if !errors.Is(err, ErrInsufficientBalance) {
		t.Fatalf("error = %v, want ErrInsufficientBalance", err)
	}
	if user := testdb.ReloadUser(t, db, 1); user.BalanceGame != 10 {
		t.Fatalf("balance changed after rejected request: %.2f", user.BalanceGame)
	}
}
