package services

import (
	"errors"
	"testing"

	"tg-lobbies-base/internal/testdb"
)

func TestExchangeTONToGameDisabled(t *testing.T) {
	db := testdb.Open(t)
	testdb.SeedUser(t, db, 1, 100)

	_, _, err := ExchangeTONToGame(db, 1, 10)
	if !errors.Is(err, ErrExchangeDisabled) {
		t.Fatalf("expected ErrExchangeDisabled, got %v", err)
	}
}
