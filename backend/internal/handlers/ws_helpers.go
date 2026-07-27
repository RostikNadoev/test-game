package handlers

import (
	"net/http"
	"strings"
	"tg-lobbies-base/internal/config"
	"tg-lobbies-base/internal/services"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

func newPvpUpgrader(cfg *config.Config) websocket.Upgrader {
	return websocket.Upgrader{
		CheckOrigin:       originAllowed(cfg),
		EnableCompression: true,
		ReadBufferSize:    1024,
		WriteBufferSize:   1024,
		HandshakeTimeout:  10 * time.Second,
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

	if cfg != nil {
		for _, origin := range cfg.CORSAllowOrigins {
			if origin == "*" {
				allowAll = true
			}

			allowed[origin] = true
		}
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