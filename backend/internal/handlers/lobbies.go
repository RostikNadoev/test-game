package handlers

import (
	"net/http"
	"tg-lobbies-base/internal/middleware"
	"tg-lobbies-base/internal/realtime"

	"github.com/gin-gonic/gin"
)

type LobbyHandler struct {
	Hub *realtime.Hub
}

type createLobbyRequest struct {
	Name     string  `json:"name" binding:"required"`
	Game     string  `json:"game" binding:"required"`
	BetCoins float64 `json:"bet_coins" binding:"required"`
}

type lobbyIDRequest struct {
	LobbyID string `json:"lobby_id" binding:"required"`
}

func (h LobbyHandler) Create(c *gin.Context) {
	userID := middleware.UserID(c)
	if userID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "bad user"})
		return
	}

	var req createLobbyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request: " + err.Error()})
		return
	}

	lobby, err := h.Hub.CreateLobby(userID, req.Name, req.Game, req.BetCoins)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"lobby": lobby.DTO()})
}

func (h LobbyHandler) GetByID(c *gin.Context) {
	lobby, err := h.Hub.GetLobby(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"lobby": lobby.DTO()})
}

// Active returns all active lobbies, or filters by ?game=<game_code>.
func (h LobbyHandler) Active(c *gin.Context) {
	game := realtime.NormalizeGameCode(c.Query("game"))
	if game != "" && !realtime.IsSupportedGame(game) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "unsupported game", "game": game})
		return
	}

	lobbies := h.Hub.ActiveSnapshot(game)
	resp := gin.H{
		"lobbies": lobbies,
		"count":   len(lobbies),
	}
	if game != "" {
		resp["game"] = game
	}
	c.JSON(http.StatusOK, resp)
}

// ActiveByGame returns active lobbies for one game.
// Example: /api/v1/lobbies/active/plinko-pvp
func (h LobbyHandler) ActiveByGame(c *gin.Context) {
	game := realtime.NormalizeGameCode(c.Param("game"))
	if game == "" || !realtime.IsSupportedGame(game) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "unsupported game", "game": game})
		return
	}

	lobbies := h.Hub.ActiveSnapshot(game)
	c.JSON(http.StatusOK, gin.H{
		"game":    game,
		"lobbies": lobbies,
		"count":   len(lobbies),
	})
}

func (h LobbyHandler) Join(c *gin.Context) {
	userID := middleware.UserID(c)
	if userID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "bad user"})
		return
	}

	var req lobbyIDRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request: " + err.Error()})
		return
	}

	lobby, err := h.Hub.JoinLobby(userID, req.LobbyID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	resp := gin.H{
		"success": true,
		"lobby":   lobby.DTO(),
	}

	if realtime.NormalizeGameCode(lobby.Game) == "blackjack_duel" && lobby.Status == realtime.LobbyStatusPlaying {
		resp["ws_url"] = "/ws/blackjack/" + lobby.ID
	}

	c.JSON(http.StatusOK, resp)
}

func (h LobbyHandler) Leave(c *gin.Context) {
	userID := middleware.UserID(c)
	if userID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "bad user"})
		return
	}

	var req lobbyIDRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request: " + err.Error()})
		return
	}

	lobby, deleted, err := h.Hub.LeaveLobby(userID, req.LobbyID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	resp := gin.H{
		"success": true,
		"deleted": deleted,
	}
	if lobby != nil {
		resp["lobby"] = lobby.DTO()
	}
	c.JSON(http.StatusOK, resp)
}

// Games returns supported lobby game codes for frontend tabs/buttons.
func (h LobbyHandler) Games(c *gin.Context) {
	games := realtime.Games()
	c.JSON(http.StatusOK, gin.H{
		"games": games,
		"count": len(games),
	})
}
