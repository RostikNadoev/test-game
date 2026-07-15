package middleware

import (
	"net/http"
	"strings"
	"tg-lobbies-base/internal/config"
	"tg-lobbies-base/internal/services"

	"github.com/gin-gonic/gin"
)

const AdminUsernameKey = "admin_username"

func AdminCORS(cfg *config.Config) gin.HandlerFunc {
	allowed := make(map[string]bool, len(cfg.AdminAllowedOrigins))
	allowAll := false
	for _, origin := range cfg.AdminAllowedOrigins {
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

func AdminRequired(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		if cfg == nil || !cfg.AdminEnabled {
			c.JSON(http.StatusNotFound, gin.H{"error": "admin panel disabled"})
			c.Abort()
			return
		}

		token := BearerToken(c.GetHeader("Authorization"))
		if token == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "admin authorization required"})
			c.Abort()
			return
		}

		username, err := services.ParseAdminJWT(token, cfg)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid admin token"})
			c.Abort()
			return
		}

		c.Set(AdminUsernameKey, username)
		c.Next()
	}
}

func AdminUsername(c *gin.Context) string {
	v, ok := c.Get(AdminUsernameKey)
	if !ok {
		return ""
	}
	name, _ := v.(string)
	return strings.TrimSpace(name)
}
