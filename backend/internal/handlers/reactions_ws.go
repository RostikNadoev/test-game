package handlers

import (
	"net/http"
	"strings"
	"tg-lobbies-base/internal/config"
	"tg-lobbies-base/internal/reactions"
	"tg-lobbies-base/internal/realtime"

	"github.com/gin-gonic/gin"
)

type ReactionsWSHandler struct {
	Cfg        *config.Config
	LobbyStore *realtime.Hub
	Manager    *reactions.Manager
}

func (h ReactionsWSHandler) Connect(c *gin.Context) {
	if h.Cfg == nil || h.LobbyStore == nil || h.Manager == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "reaction websocket is not configured"})
		return
	}

	userID, ok := wsAuthUserID(c, h.Cfg)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "bad token"})
		return
	}

	lobbyID := strings.TrimSpace(c.Param("lobby_id"))
	if lobbyID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "lobby_id is required"})
		return
	}

	lobby, err := h.LobbyStore.GetLobby(lobbyID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "lobby not found"})
		return
	}
	if lobby.Status != realtime.LobbyStatusPlaying {
		c.JSON(http.StatusBadRequest, gin.H{"error": "lobby is not playing"})
		return
	}
	if !lobby.Players[userID] {
		c.JSON(http.StatusForbidden, gin.H{"error": "user is not in this lobby"})
		return
	}

	upgrader := newPvpUpgrader(h.Cfg)
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	_ = h.Manager.Connect(lobbyID, userID, conn)
}
