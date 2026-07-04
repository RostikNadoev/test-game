package handlers

import (
	"net/http"
	"tg-lobbies-base/internal/database"
	"tg-lobbies-base/internal/middleware"
	"tg-lobbies-base/internal/services"

	"github.com/gin-gonic/gin"
)

type UserHandler struct{}

func (UserHandler) Profile(c *gin.Context) {
	user, err := services.GetUserProfile(database.DB(), middleware.UserID(c))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"user": userDTO(user)})
}

func (UserHandler) Balance(c *gin.Context) {
	user, err := services.GetUserProfile(database.DB(), middleware.UserID(c))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"balance": gin.H{"ton": user.BalanceTON, "game": user.BalanceGame}})
}

func (UserHandler) Stats(c *gin.Context) {
	user, err := services.GetUserProfile(database.DB(), middleware.UserID(c))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	st := user.Stats
	c.JSON(http.StatusOK, gin.H{"stats": gin.H{
		"rating":        st.Rating,
		"wins":          st.Wins,
		"losses":        st.Losses,
		"total_games":   st.TotalGames(),
		"winrate":       st.WinRate(),
		"favorite_mode": st.FavoriteMode,
	}})
}
