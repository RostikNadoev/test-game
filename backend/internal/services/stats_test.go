package services

import (
	"testing"

	"tg-lobbies-base/internal/models"
	"tg-lobbies-base/internal/testdb"
)

func TestApplyMatchResultUsesFixedRatingDeltas(t *testing.T) {
	db := testdb.Open(t)
	testdb.SeedUser(t, db, 1, 100)
	testdb.SeedUser(t, db, 2, 100)

	if err := ApplyMatchResult(db, 1, 2, "plinko_pvp", false); err != nil {
		t.Fatalf("apply decisive result: %v", err)
	}

	var winner models.UserStats
	if err := db.Where("user_id = ?", 1).First(&winner).Error; err != nil {
		t.Fatalf("load winner stats: %v", err)
	}
	var loser models.UserStats
	if err := db.Where("user_id = ?", 2).First(&loser).Error; err != nil {
		t.Fatalf("load loser stats: %v", err)
	}

	if winner.Rating != 1025 {
		t.Fatalf("winner rating = %d, want 1025", winner.Rating)
	}
	if loser.Rating != 980 {
		t.Fatalf("loser rating = %d, want 980", loser.Rating)
	}

	if err := ApplyMatchResult(db, 1, 2, "plinko_pvp", true); err != nil {
		t.Fatalf("apply draw result: %v", err)
	}
	if err := db.Where("user_id = ?", 1).First(&winner).Error; err != nil {
		t.Fatalf("reload first player stats: %v", err)
	}
	if err := db.Where("user_id = ?", 2).First(&loser).Error; err != nil {
		t.Fatalf("reload second player stats: %v", err)
	}

	if winner.Rating != 1025 || loser.Rating != 980 {
		t.Fatalf("draw changed ratings: got %d and %d", winner.Rating, loser.Rating)
	}
}
