package handlers

import (
	"log"
	"net/http"
	"tg-lobbies-base/internal/config"
	"tg-lobbies-base/internal/database"
	"tg-lobbies-base/internal/middleware"
	"tg-lobbies-base/internal/services"
	"tg-lobbies-base/internal/telegram"
	"time"

	"github.com/gin-gonic/gin"
)

type AuthHandler struct {
	Cfg *config.Config
}

func (h AuthHandler) TelegramAuth(c *gin.Context) {
	var req struct {
		InitData string `json:"init_data" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "init_data is required"})
		return
	}

	parsed, err := telegram.ValidateAndParse(
		req.InitData,
		h.Cfg.TelegramBotToken,
		24*time.Hour,
		h.Cfg.AllowDevAuth,
	)
	if err != nil {
		log.Printf("telegram auth failed: %v", err)
		if h.Cfg.GinMode == "release" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "telegram auth failed"})
			return
		}
		c.JSON(http.StatusUnauthorized, gin.H{"error": "telegram auth failed", "details": err.Error()})
		return
	}

	user, err := services.UpsertTelegramUserWithStartParam(
		database.DB(),
		parsed.User,
		parsed.StartParam,
		h.Cfg.ReferralRewardRating,
	)
	if err != nil {
		if h.Cfg.GinMode == "release" {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to upsert user"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to upsert user", "details": err.Error()})
		return
	}

	checker := services.TelegramChannelMembershipChecker{
		BotToken: h.Cfg.TelegramBotToken,
		Channel:  h.Cfg.ReferralChannel,
	}
	if _, referralErr := services.CheckAndRewardReferral(
		c.Request.Context(),
		database.DB(),
		user.ID,
		checker,
		h.Cfg.ReferralBotUsername,
		h.Cfg.ReferralChannelURL,
		h.Cfg.ReferralRewardRating,
	); referralErr != nil {
		log.Printf("referral check during auth failed for user %d: %v", user.ID, referralErr)
	}

	token, err := services.GenerateJWT(user.ID, h.Cfg)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"token": token,
		"user":  userDTO(user),
	})
}

func (h AuthHandler) Me(c *gin.Context) {
	userID := middleware.UserID(c)
	user, err := services.GetUserProfile(database.DB(), userID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"user": userDTO(user)})
}
