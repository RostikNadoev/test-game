package handlers

import (
	"errors"
	"net/http"
	"strconv"
	"strings"
	"tg-lobbies-base/internal/config"
	"tg-lobbies-base/internal/database"
	"tg-lobbies-base/internal/middleware"
	"tg-lobbies-base/internal/realtime"
	"tg-lobbies-base/internal/services"

	"github.com/gin-gonic/gin"
)

type AdminHandler struct {
	Cfg *config.Config
	Hub *realtime.Hub
}

type adminLoginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

type adminReasonRequest struct {
	Reason string `json:"reason" binding:"required"`
}

type adminWalletAdjustRequest struct {
	Currency  string  `json:"currency" binding:"required"`
	Operation string  `json:"operation" binding:"required"`
	Amount    float64 `json:"amount" binding:"required"`
	Reason    string  `json:"reason" binding:"required"`
}

func (h AdminHandler) Login(c *gin.Context) {
	if h.Cfg == nil || !h.Cfg.AdminEnabled {
		c.JSON(http.StatusNotFound, gin.H{"error": "admin panel disabled"})
		return
	}

	var req adminLoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	username := strings.TrimSpace(req.Username)
	if username == "" || username != strings.TrimSpace(h.Cfg.AdminUsername) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}
	if err := services.VerifyAdminPassword(h.Cfg, req.Password); err != nil {
		switch {
		case errors.Is(err, services.ErrAdminNotConfigured):
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "admin credentials not configured"})
		default:
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		}
		return
	}

	token, err := services.GenerateAdminJWT(username, h.Cfg)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to issue token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"token":    token,
		"username": username,
	})
}

func (h AdminHandler) Me(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"username": middleware.AdminUsername(c),
		"role":     "admin",
	})
}

func (h AdminHandler) Dashboard(c *gin.Context) {
	db := database.DB()
	activeLobbies := 0
	if h.Hub != nil {
		activeLobbies = len(h.Hub.ActiveSnapshot(""))
	}
	stats, err := services.GetAdminDashboardStats(db, activeLobbies)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load dashboard"})
		return
	}
	recentTx, err := services.ListRecentWalletTransactions(db, 20)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load recent transactions"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"stats":                stats,
		"recent_transactions": recentTx,
	})
}

func (h AdminHandler) ListUsers(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "25"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	users, total, err := services.ListUsersAdmin(database.DB(), c.Query("q"), c.Query("blocked"), limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list users"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"users":  users,
		"total":  total,
		"limit":  limit,
		"offset": offset,
	})
}

func (h AdminHandler) GetUser(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || id == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user id"})
		return
	}
	detail, err := services.GetAdminUserDetail(database.DB(), uint(id))
	if err != nil {
		if errors.Is(err, services.ErrUserNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load user"})
		return
	}
	c.JSON(http.StatusOK, detail)
}

func (h AdminHandler) BlockUser(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || id == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user id"})
		return
	}
	var req adminReasonRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "reason is required"})
		return
	}

	admin := middleware.AdminUsername(c)
	before, _ := services.GetAdminUserDetail(database.DB(), uint(id))
	user, err := services.BlockUser(database.DB(), uint(id), req.Reason, admin)
	if err != nil {
		if errors.Is(err, services.ErrUserNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to block user"})
		return
	}
	_ = services.RecordAdminAction(database.DB(), admin, "user_block", "user", strconv.FormatUint(id, 10), req.Reason, c.ClientIP(), before, user)
	c.JSON(http.StatusOK, gin.H{"user": user})
}

func (h AdminHandler) UnblockUser(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || id == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user id"})
		return
	}
	var req adminReasonRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "reason is required"})
		return
	}

	admin := middleware.AdminUsername(c)
	before, _ := services.GetAdminUserDetail(database.DB(), uint(id))
	user, err := services.UnblockUser(database.DB(), uint(id))
	if err != nil {
		if errors.Is(err, services.ErrUserNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to unblock user"})
		return
	}
	_ = services.RecordAdminAction(database.DB(), admin, "user_unblock", "user", strconv.FormatUint(id, 10), req.Reason, c.ClientIP(), before, user)
	c.JSON(http.StatusOK, gin.H{"user": user})
}

func (h AdminHandler) AdjustWallet(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || id == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user id"})
		return
	}
	var req adminWalletAdjustRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	result, err := services.AdminAdjustWallet(database.DB(), uint(id), services.AdminWalletAdjustInput{
		Currency:  req.Currency,
		Operation: req.Operation,
		Amount:    req.Amount,
		Reason:    req.Reason,
	}, middleware.AdminUsername(c), c.ClientIP())
	if err != nil {
		switch {
		case errors.Is(err, services.ErrUserNotFound):
			c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		case errors.Is(err, services.ErrInvalidCurrency):
			c.JSON(http.StatusBadRequest, gin.H{"error": "currency must be game or ton"})
		case errors.Is(err, services.ErrNegativeBalance):
			c.JSON(http.StatusBadRequest, gin.H{"error": "insufficient balance for debit"})
		default:
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		}
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success":     true,
		"user":        result.User,
		"transaction": result.Transaction,
	})
}

func (h AdminHandler) ListSessions(c *gin.Context) {
	lobbies := make([]services.AdminLobbySessionItem, 0)
	if h.Hub != nil {
		for _, dto := range h.Hub.ActiveSnapshot("") {
			players := make([]services.AdminLobbyPlayer, 0, len(dto.PlayersInfo))
			for _, p := range dto.PlayersInfo {
				players = append(players, services.AdminLobbyPlayer{UserID: p.ID, TgUser: p.TgUser})
			}
			lobbies = append(lobbies, services.AdminLobbySessionItem{
				ID:          dto.ID,
				Name:        dto.Name,
				Game:        dto.Game,
				Status:      dto.Status,
				BetCoins:    dto.BetCoins,
				PlayerCount: dto.PlayerCount,
				Players:     players,
				CreatedAt:   dto.CreatedAt,
			})
		}
	}
	resp, err := services.ListAdminSessions(database.DB(), lobbies)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list sessions"})
		return
	}
	c.JSON(http.StatusOK, resp)
}

func (h AdminHandler) AbandonSoloSession(c *gin.Context) {
	var req adminReasonRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "reason is required"})
		return
	}
	sessionID := strings.TrimSpace(c.Param("id"))
	result, err := services.AdminAbandonSoloSession(database.DB(), sessionID)
	if err != nil {
		switch {
		case errors.Is(err, services.ErrSoloSessionNotFound):
			c.JSON(http.StatusNotFound, gin.H{"error": "session not found"})
		case errors.Is(err, services.ErrSoloSessionNotActive):
			c.JSON(http.StatusBadRequest, gin.H{"error": "session is not active"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to abandon session"})
		}
		return
	}
	_ = services.RecordAdminAction(database.DB(), middleware.AdminUsername(c), "solo_abandon", "solo_session", sessionID, req.Reason, c.ClientIP(), nil, result)
	c.JSON(http.StatusOK, gin.H{"success": true, "session": result})
}

func (h AdminHandler) ListGames(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"games": services.ListGameSettings(),
		"count": len(services.ListGameSettings()),
	})
}

func (h AdminHandler) PatchGame(c *gin.Context) {
	code := strings.TrimSpace(c.Param("code"))
	var req map[string]any
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}
	reason, _ := req["reason"].(string)
	delete(req, "reason")
	if strings.TrimSpace(reason) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "reason is required"})
		return
	}

	before, _ := services.GetGameSetting(code)
	updated, err := services.UpdateGameSetting(database.DB(), code, req)
	if err != nil {
		if errors.Is(err, services.ErrGameNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "game not found"})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	_ = services.RecordAdminAction(database.DB(), middleware.AdminUsername(c), "game_update", "game", code, reason, c.ClientIP(), before, updated)
	c.JSON(http.StatusOK, gin.H{"game": updated})
}

func (h AdminHandler) ListAudit(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	rows, total, err := services.ListAdminAuditLogs(database.DB(), c.Query("action"), limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load audit log"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"items":  rows,
		"total":  total,
		"limit":  limit,
		"offset": offset,
	})
}
