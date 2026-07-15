package handlers

import (
	"net/http"
	"sort"
	"strings"
	"tg-lobbies-base/internal/config"
	"tg-lobbies-base/internal/games/neonmatrix"
	"tg-lobbies-base/internal/realtime"

	"github.com/gin-gonic/gin"
)

type NeonMatrixWSHandler struct {
	Cfg        *config.Config
	LobbyStore *realtime.Hub
	Manager    *neonmatrix.Manager
}

func (h NeonMatrixWSHandler) Connect(c *gin.Context) {
	if h.Cfg == nil || h.LobbyStore == nil || h.Manager == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "neon matrix websocket is not configured"})
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
	if realtime.NormalizeGameCode(lobby.Game) != neonmatrix.GameCode {
		c.JSON(http.StatusBadRequest, gin.H{"error": "lobby is not neon_matrix"})
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

	players := make([]uint, 0, len(lobby.Players))
	for id := range lobby.Players {
		players = append(players, id)
	}
	sort.Slice(players, func(i, j int) bool { return players[i] < players[j] })

	upgrader := newPvpUpgrader(h.Cfg)
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}

	if err := h.Manager.Connect(lobby.ID, players, userID, conn); err != nil {
		_ = conn.WriteJSON(gin.H{"type": "error", "error": err.Error()})
		_ = conn.Close()
	}
}
