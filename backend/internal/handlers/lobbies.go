package handlers

import (
	"net/http"
	"tg-lobbies-base/internal/middleware"
	"tg-lobbies-base/internal/realtime"
	"tg-lobbies-base/internal/services"

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

func wsURLForGame(game, lobbyID string) string {
	switch realtime.NormalizeGameCode(game) {
	case "air_hockey":
		return "/ws/air-hockey/" + lobbyID
	case "blackjack_duel":
		return "/ws/blackjack/" + lobbyID
	case "plinko_pvp":
		return "/ws/plinko/" + lobbyID
	case "paper_io":
		return "/ws/paper-io/" + lobbyID
	case "street_race":
		return "/ws/street-race/" + lobbyID
	case "tower_stack":
		return "/ws/tower-stack/" + lobbyID
	default:
		return ""
	}
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

	c.JSON(http.StatusOK, gin.H{"lobby": h.Hub.BuildDTO(lobby)})
}

func (h LobbyHandler) GetByID(c *gin.Context) {
	dto, err := h.Hub.GetLobbyDTO(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"lobby": dto})
}

func (h LobbyHandler) Active(c *gin.Context) {
	game := realtime.NormalizeGameCode(c.Query("game"))
	if game != "" && !services.IsPvpGameSupported(game) {
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

func (h LobbyHandler) ActiveByGame(c *gin.Context) {
	game := realtime.NormalizeGameCode(c.Param("game"))
	if game == "" || !services.IsPvpGameSupported(game) {
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
		"lobby":   h.Hub.BuildDTO(lobby),
	}

	if lobby.Status == realtime.LobbyStatusPlaying {
		if wsURL := wsURLForGame(lobby.Game, lobby.ID); wsURL != "" {
			resp["ws_url"] = wsURL
		}
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
		resp["lobby"] = h.Hub.BuildDTO(lobby)
	}
	c.JSON(http.StatusOK, resp)
}

func (h LobbyHandler) Games(c *gin.Context) {
	games := services.ListEnabledPvpGames()
	c.JSON(http.StatusOK, gin.H{
		"games": games,
		"count": len(games),
	})
}
