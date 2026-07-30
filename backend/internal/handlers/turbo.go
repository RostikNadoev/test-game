package handlers

import (
	"net/http"
	"tg-lobbies-base/internal/middleware"
	"tg-lobbies-base/internal/turbo"

	"github.com/gin-gonic/gin"
)

type TurboHandler struct {
	Manager *turbo.Manager
}

func (h TurboHandler) Join(c *gin.Context) {
	status, err := h.Manager.Join(middleware.UserID(c))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, status)
}

func (h TurboHandler) Status(c *gin.Context) {
	c.JSON(http.StatusOK, h.Manager.Status(middleware.UserID(c)))
}

func (h TurboHandler) Cancel(c *gin.Context) {
	c.JSON(http.StatusOK, h.Manager.Cancel(middleware.UserID(c)))
}
