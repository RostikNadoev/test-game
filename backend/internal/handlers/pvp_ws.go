package handlers

import (
	"net/http"
	"sort"
	"strings"
	"tg-lobbies-base/internal/config"
	"tg-lobbies-base/internal/games/pvp"
	"tg-lobbies-base/internal/realtime"
	"tg-lobbies-base/internal/services"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

type PvpWSHandler struct {
	Cfg        *config.Config
	LobbyStore *realtime.Hub
	Manager    *pvp.Manager
	GameCode   string
}

func newPvpUpgrader(cfg *config.Config) websocket.Upgrader {
	return websocket.Upgrader{
		CheckOrigin:       originAllowed(cfg),
		EnableCompression: true,
		ReadBufferSize:    1024,
		WriteBufferSize:   1024,
		HandshakeTimeout:  10 * time.Second,
	}
}

func (h PvpWSHandler) Connect(c *gin.Context) {
	if h.Cfg == nil || h.LobbyStore == nil || h.Manager == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "pvp websocket is not configured"})
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
	if realtime.NormalizeGameCode(lobby.Game) != h.GameCode {
		c.JSON(http.StatusBadRequest, gin.H{"error": "lobby game mismatch"})
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

	if err := h.Manager.Connect(h.GameCode, lobby.ID, players, userID, conn); err != nil {
		_ = conn.WriteJSON(gin.H{"type": "error", "error": err.Error()})
		_ = conn.Close()
	}
}

func wsAuthUserID(c *gin.Context, cfg *config.Config) (uint, bool) {
	token := strings.TrimSpace(c.Query("token"))
	if token == "" {
		return 0, false
	}
	userID, err := services.ParseJWT(token, cfg)
	if err != nil || userID == 0 {
		return 0, false
	}
	return userID, true
}

func originAllowed(cfg *config.Config) func(r *http.Request) bool {
	allowed := make(map[string]bool)
	allowAll := false
	for _, origin := range cfg.CORSAllowOrigins {
		if origin == "*" {
			allowAll = true
		}
		allowed[origin] = true
	}

	return func(r *http.Request) bool {
		if allowAll {
			return true
		}
		origin := r.Header.Get("Origin")
		if origin == "" {
			return true
		}
		return allowed[origin]
	}
}
