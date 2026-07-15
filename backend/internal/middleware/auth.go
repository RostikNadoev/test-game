package middleware

import (
	"errors"
	"net/http"
	"strings"
	"tg-lobbies-base/internal/config"
	"tg-lobbies-base/internal/database"
	"tg-lobbies-base/internal/services"

	"github.com/gin-gonic/gin"
)

const UserIDKey = "user_id"

func CORS(cfg *config.Config) gin.HandlerFunc {
	allowed := make(map[string]bool, len(cfg.CORSAllowOrigins))
	allowAll := false
	for _, origin := range cfg.CORSAllowOrigins {
		if origin == "*" {
			allowAll = true
		}
		allowed[origin] = true
	}

	return func(c *gin.Context) {
		origin := c.Request.Header.Get("Origin")
		if allowAll {
			c.Header("Access-Control-Allow-Origin", "*")
		} else if allowed[origin] {
			c.Header("Access-Control-Allow-Origin", origin)
			c.Header("Vary", "Origin")
			c.Header("Access-Control-Allow-Credentials", "true")
		}

		c.Header("Access-Control-Allow-Headers", "Authorization, Content-Type")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")

		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}

func AuthRequired(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		token := BearerToken(c.GetHeader("Authorization"))
		if token == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "authorization bearer token required"})
			c.Abort()
			return
		}

		userID, err := services.ParseJWT(token, cfg)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
			c.Abort()
			return
		}

		c.Set(UserIDKey, userID)

		if err := services.EnsureUserNotBlocked(database.DB(), userID); err != nil {
			if errors.Is(err, services.ErrUserBlocked) {
				c.JSON(http.StatusForbidden, gin.H{"error": "account blocked"})
				c.Abort()
				return
			}
		}

		c.Next()
	}
}

func BearerToken(header string) string {
	parts := strings.Fields(header)
	if len(parts) == 2 && strings.EqualFold(parts[0], "Bearer") {
		return parts[1]
	}
	return ""
}

func UserID(c *gin.Context) uint {
	v, ok := c.Get(UserIDKey)
	if !ok {
		return 0
	}
	id, _ := v.(uint)
	return id
}
