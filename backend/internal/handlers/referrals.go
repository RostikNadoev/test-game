package handlers

import (
	"net/http"

	"tg-lobbies-base/internal/config"
	"tg-lobbies-base/internal/database"
	"tg-lobbies-base/internal/middleware"
	"tg-lobbies-base/internal/services"

	"github.com/gin-gonic/gin"
)

type ReferralHandler struct {
	Cfg *config.Config
}

func (h ReferralHandler) Status(c *gin.Context) {
	userID := middleware.UserID(c)
	status, err := services.GetReferralStatus(
		database.DB(),
		userID,
		h.Cfg.ReferralBotUsername,
		h.Cfg.ReferralChannelURL,
		h.Cfg.ReferralRewardRating,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load referral status"})
		return
	}

	c.JSON(http.StatusOK, status)
}

func (h ReferralHandler) Check(c *gin.Context) {
	userID := middleware.UserID(c)
	checker := services.TelegramChannelMembershipChecker{
		BotToken: h.Cfg.TelegramBotToken,
		Channel:  h.Cfg.ReferralChannel,
	}
	result, err := services.CheckAndRewardReferral(
		c.Request.Context(),
		database.DB(),
		userID,
		checker,
		h.Cfg.ReferralBotUsername,
		h.Cfg.ReferralChannelURL,
		h.Cfg.ReferralRewardRating,
	)
	if err != nil {
		response := gin.H{"error": "failed to verify channel subscription"}
		if h.Cfg.GinMode != "release" {
			response["details"] = err.Error()
		}
		c.JSON(http.StatusBadGateway, response)
		return
	}

	c.JSON(http.StatusOK, result)
}
