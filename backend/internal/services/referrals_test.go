package services

import (
	"context"
	"testing"

	"tg-lobbies-base/internal/models"
	"tg-lobbies-base/internal/telegram"
	"tg-lobbies-base/internal/testdb"
)

type fixedMembershipChecker bool

func (checker fixedMembershipChecker) IsMember(context.Context, int64) (bool, error) {
	return bool(checker), nil
}

func TestReferralRewardIsGrantedOnlyOnce(t *testing.T) {
	db := testdb.Open(t)
	testdb.SeedUser(t, db, 1, 100)

	profile, err := EnsureReferralProfile(db, 1)
	if err != nil {
		t.Fatalf("create referral profile: %v", err)
	}

	referred, err := UpsertTelegramUserWithStartParam(
		db,
		telegram.WebAppUser{ID: 2002, Username: "friend"},
		referralStartPrefix+profile.Code,
		20,
	)
	if err != nil {
		t.Fatalf("create referred user: %v", err)
	}

	first, err := CheckAndRewardReferral(
		context.Background(),
		db,
		referred.ID,
		fixedMembershipChecker(true),
		"twingames_bot",
		"https://t.me/tw1ngames",
		20,
	)
	if err != nil {
		t.Fatalf("first referral check: %v", err)
	}
	if !first.Subscribed || !first.RewardGranted {
		t.Fatalf("first check result = %+v, want subscribed and rewarded", first)
	}

	second, err := CheckAndRewardReferral(
		context.Background(),
		db,
		referred.ID,
		fixedMembershipChecker(true),
		"twingames_bot",
		"https://t.me/tw1ngames",
		20,
	)
	if err != nil {
		t.Fatalf("second referral check: %v", err)
	}
	if second.RewardGranted {
		t.Fatal("second check granted a duplicate reward")
	}

	var stats models.UserStats
	if err := db.Where("user_id = ?", 1).First(&stats).Error; err != nil {
		t.Fatalf("load referrer stats: %v", err)
	}
	if stats.Rating != 1020 {
		t.Fatalf("referrer rating = %d, want 1020", stats.Rating)
	}

	var referral models.Referral
	if err := db.Where("referred_user_id = ?", referred.ID).First(&referral).Error; err != nil {
		t.Fatalf("load referral: %v", err)
	}
	if referral.RewardedAt == nil || referral.ChannelVerifiedAt == nil {
		t.Fatalf("referral was not finalized: %+v", referral)
	}
}

func TestReferralRequiresChannelMembership(t *testing.T) {
	db := testdb.Open(t)
	testdb.SeedUser(t, db, 1, 100)
	profile, err := EnsureReferralProfile(db, 1)
	if err != nil {
		t.Fatalf("create referral profile: %v", err)
	}

	referred, err := UpsertTelegramUserWithStartParam(
		db,
		telegram.WebAppUser{ID: 2003, Username: "not_member"},
		referralStartPrefix+profile.Code,
		20,
	)
	if err != nil {
		t.Fatalf("create referred user: %v", err)
	}

	result, err := CheckAndRewardReferral(
		context.Background(),
		db,
		referred.ID,
		fixedMembershipChecker(false),
		"twingames_bot",
		"https://t.me/tw1ngames",
		20,
	)
	if err != nil {
		t.Fatalf("check referral: %v", err)
	}
	if result.Subscribed || result.RewardGranted {
		t.Fatalf("unexpected reward without subscription: %+v", result)
	}

	var stats models.UserStats
	if err := db.Where("user_id = ?", 1).First(&stats).Error; err != nil {
		t.Fatalf("load referrer stats: %v", err)
	}
	if stats.Rating != 1000 {
		t.Fatalf("referrer rating = %d, want 1000", stats.Rating)
	}
}
