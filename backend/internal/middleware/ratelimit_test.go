package middleware_test

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"tg-lobbies-base/internal/middleware"

	"github.com/gin-gonic/gin"
)

func TestRateLimitAllowsWithinWindow(t *testing.T) {
	gin.SetMode(gin.TestMode)

	router := gin.New()
	router.GET("/", middleware.RateLimit(2, time.Minute), func(c *gin.Context) {
		c.Status(http.StatusOK)
	})

	for i := 0; i < 2; i++ {
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		router.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("request %d status = %d, want 200", i+1, rec.Code)
		}
	}

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("third request status = %d, want 429", rec.Code)
	}
}
