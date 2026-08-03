package services

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"tg-lobbies-base/internal/models"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const referralStartPrefix = "ref_"

type ReferralStatus struct {
	Code                 string `json:"code"`
	InviteURL            string `json:"invite_url"`
	ChannelURL           string `json:"channel_url"`
	RewardRating         int    `json:"reward_rating"`
	InvitedCount         int64  `json:"invited_count"`
	RewardedCount        int64  `json:"rewarded_count"`
	EarnedRating         int64  `json:"earned_rating"`
	IncomingPending      bool   `json:"incoming_pending"`
	IncomingRewarded     bool   `json:"incoming_rewarded"`
	SubscriptionVerified bool   `json:"subscription_verified"`
}

type ReferralCheckResult struct {
	ReferralStatus
	Subscribed   bool `json:"subscribed"`
	RewardGranted bool `json:"reward_granted"`
}

type ChannelMembershipChecker interface {
	IsMember(ctx context.Context, telegramUserID int64) (bool, error)
}

type TelegramChannelMembershipChecker struct {
	BotToken string
	Channel  string
	Client   *http.Client
}

func (c TelegramChannelMembershipChecker) IsMember(ctx context.Context, telegramUserID int64) (bool, error) {
	if strings.TrimSpace(c.BotToken) == "" || strings.TrimSpace(c.Channel) == "" {
		return false, errors.New("referral channel check is not configured")
	}

	body, err := json.Marshal(map[string]any{
		"chat_id": c.Channel,
		"user_id": telegramUserID,
	})
	if err != nil {
		return false, err
	}

	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		"https://api.telegram.org/bot"+c.BotToken+"/getChatMember",
		bytes.NewReader(body),
	)
	if err != nil {
		return false, err
	}
	req.Header.Set("Content-Type", "application/json")

	client := c.Client
	if client == nil {
		client = &http.Client{Timeout: 8 * time.Second}
	}
	response, err := client.Do(req)
	if err != nil {
		return false, fmt.Errorf("check telegram channel membership: %w", err)
	}
	defer response.Body.Close()

	var payload struct {
		OK          bool   `json:"ok"`
		Description string `json:"description"`
		Result      struct {
			Status   string `json:"status"`
			IsMember bool   `json:"is_member"`
		} `json:"result"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		return false, fmt.Errorf("decode telegram membership response: %w", err)
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 || !payload.OK {
		if payload.Description == "" {
			payload.Description = response.Status
		}
		return false, fmt.Errorf("telegram membership check failed: %s", payload.Description)
	}

	switch payload.Result.Status {
	case "creator", "administrator", "member":
		return true, nil
	case "restricted":
		return payload.Result.IsMember, nil
	default:
		return false, nil
	}
}

func EnsureReferralProfile(db *gorm.DB, userID uint) (*models.ReferralProfile, error) {
	var profile models.ReferralProfile
	if err := db.Where("user_id = ?", userID).First(&profile).Error; err == nil {
		return &profile, nil
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	for attempt := 0; attempt < 5; attempt++ {
		code, err := randomReferralCode()
		if err != nil {
			return nil, err
		}
		profile = models.ReferralProfile{UserID: userID, Code: code}
		if err := db.Create(&profile).Error; err == nil {
			return &profile, nil
		}
		if err := db.Where("user_id = ?", userID).First(&profile).Error; err == nil {
			return &profile, nil
		}
	}

	return nil, errors.New("failed to create referral profile")
}

func attachReferralOnRegistrationTx(tx *gorm.DB, referredUserID uint, startParam string, rewardRating int) error {
	startParam = strings.TrimSpace(startParam)
	if !strings.HasPrefix(startParam, referralStartPrefix) {
		return nil
	}
	code := strings.TrimSpace(strings.TrimPrefix(startParam, referralStartPrefix))
	if code == "" || len(code) > 32 {
		return nil
	}

	var profile models.ReferralProfile
	if err := tx.Where("code = ?", code).First(&profile).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil
		}
		return err
	}
	if profile.UserID == referredUserID {
		return nil
	}
	if rewardRating <= 0 {
		rewardRating = 20
	}

	referral := models.Referral{
		ReferrerUserID: profile.UserID,
		ReferredUserID: referredUserID,
		RewardRating:   rewardRating,
	}
	return tx.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "referred_user_id"}},
		DoNothing: true,
	}).Create(&referral).Error
}

func GetReferralStatus(db *gorm.DB, userID uint, botUsername, channelURL string, rewardRating int) (*ReferralStatus, error) {
	profile, err := EnsureReferralProfile(db, userID)
	if err != nil {
		return nil, err
	}

	var invitedCount int64
	if err := db.Model(&models.Referral{}).
		Where("referrer_user_id = ?", userID).
		Count(&invitedCount).Error; err != nil {
		return nil, err
	}

	var rewarded struct {
		Count int64
		Total int64
	}
	if err := db.Model(&models.Referral{}).
		Select("COUNT(*) AS count, COALESCE(SUM(reward_rating), 0) AS total").
		Where("referrer_user_id = ? AND rewarded_at IS NOT NULL", userID).
		Scan(&rewarded).Error; err != nil {
		return nil, err
	}

	var incoming models.Referral
	incomingErr := db.Where("referred_user_id = ?", userID).First(&incoming).Error
	if incomingErr != nil && !errors.Is(incomingErr, gorm.ErrRecordNotFound) {
		return nil, incomingErr
	}

	botUsername = strings.TrimPrefix(strings.TrimSpace(botUsername), "@")
	inviteURL := ""
	if botUsername != "" {
		inviteURL = "https://t.me/" + botUsername + "?startapp=" + url.QueryEscape(referralStartPrefix+profile.Code)
	}
	if rewardRating <= 0 {
		rewardRating = 20
	}

	status := &ReferralStatus{
		Code:          profile.Code,
		InviteURL:     inviteURL,
		ChannelURL:    channelURL,
		RewardRating:  rewardRating,
		InvitedCount:  invitedCount,
		RewardedCount: rewarded.Count,
		EarnedRating:  rewarded.Total,
	}
	if incomingErr == nil {
		status.IncomingPending = incoming.RewardedAt == nil
		status.IncomingRewarded = incoming.RewardedAt != nil
		status.SubscriptionVerified = incoming.ChannelVerifiedAt != nil
	}

	return status, nil
}

func CheckAndRewardReferral(
	ctx context.Context,
	db *gorm.DB,
	userID uint,
	checker ChannelMembershipChecker,
	botUsername, channelURL string,
	rewardRating int,
) (*ReferralCheckResult, error) {
	var referral models.Referral
	err := db.Where("referred_user_id = ?", userID).First(&referral).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		status, statusErr := GetReferralStatus(db, userID, botUsername, channelURL, rewardRating)
		if statusErr != nil {
			return nil, statusErr
		}
		return &ReferralCheckResult{ReferralStatus: *status}, nil
	}
	if err != nil {
		return nil, err
	}
	if referral.RewardedAt != nil {
		status, statusErr := GetReferralStatus(db, userID, botUsername, channelURL, rewardRating)
		if statusErr != nil {
			return nil, statusErr
		}
		return &ReferralCheckResult{ReferralStatus: *status, Subscribed: true}, nil
	}

	var user models.User
	if err := db.Select("id", "telegram_id").First(&user, userID).Error; err != nil {
		return nil, err
	}
	subscribed, err := checker.IsMember(ctx, user.TelegramID)
	if err != nil {
		return nil, err
	}
	granted := false
	if subscribed {
		err = db.Transaction(func(tx *gorm.DB) error {
			var locked models.Referral
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
				Where("referred_user_id = ?", userID).
				First(&locked).Error; err != nil {
				return err
			}
			if locked.RewardedAt != nil {
				return nil
			}
			if err := EnsureUserStats(tx, locked.ReferrerUserID); err != nil {
				return err
			}

			var stats models.UserStats
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
				Where("user_id = ?", locked.ReferrerUserID).
				First(&stats).Error; err != nil {
				return err
			}
			stats.Rating += locked.RewardRating
			if err := tx.Save(&stats).Error; err != nil {
				return err
			}

			now := time.Now().UTC()
			locked.ChannelVerifiedAt = &now
			locked.RewardedAt = &now
			if err := tx.Save(&locked).Error; err != nil {
				return err
			}
			granted = true
			return nil
		})
		if err != nil {
			return nil, err
		}
	}

	status, err := GetReferralStatus(db, userID, botUsername, channelURL, rewardRating)
	if err != nil {
		return nil, err
	}
	return &ReferralCheckResult{
		ReferralStatus: *status,
		Subscribed:     subscribed,
		RewardGranted:  granted,
	}, nil
}

func randomReferralCode() (string, error) {
	buffer := make([]byte, 8)
	if _, err := rand.Read(buffer); err != nil {
		return "", err
	}
	return hex.EncodeToString(buffer), nil
}
