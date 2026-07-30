package handlers

import (
	"net/http"

	"tg-lobbies-base/internal/middleware"
	"tg-lobbies-base/internal/presence"

	"github.com/gin-gonic/gin"
)

type PresenceHandler struct {
	Manager *presence.Manager
}

func (h PresenceHandler) Heartbeat(c *gin.Context) {
	if h.Manager == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "presence is not configured"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"online": h.Manager.Touch(middleware.UserID(c)),
	})
}
