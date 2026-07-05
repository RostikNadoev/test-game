package config

import (
	"os"
	"strconv"
	"strings"
	"fmt"

	"github.com/joho/godotenv"
)

type Config struct {
	Port             string
	GinMode          string
	AppEnv           string
	DatabaseDSN      string
	TelegramBotToken string
	JWTSecret        string
	JWTTTLHours      int
	AllowDevAuth     bool
	CORSAllowOrigins []string
}

func Load() *Config {
	_ = godotenv.Load()

	cfg := &Config{
		Port:             getEnv("PORT", "8080"),
		GinMode:          getEnv("GIN_MODE", "debug"),
		AppEnv:           getEnv("APP_ENV", "local"),
		DatabaseDSN:      getEnv("DATABASE_DSN", "host=localhost user=postgres password=postgres dbname=tg_lobbies port=5432 sslmode=disable TimeZone=UTC"),
		TelegramBotToken: getEnv("TELEGRAM_BOT_TOKEN", ""),
		JWTSecret:        getEnv("JWT_SECRET", "change_me"),
		JWTTTLHours:      getEnvAsInt("JWT_TTL_HOURS", 168),
		AllowDevAuth:     getEnvAsBool("ALLOW_DEV_AUTH", false),
		CORSAllowOrigins: splitCSV(getEnv("CORS_ALLOW_ORIGINS", "*")),
	}

	return cfg
}

func (c *Config) Validate() error {
	if c.GinMode == "release" && c.JWTSecret == "change_me" {
		return fmt.Errorf("JWT_SECRET must be set in release mode")
	}
	if c.AllowDevAuth && c.GinMode == "release" {
		return fmt.Errorf("ALLOW_DEV_AUTH cannot be enabled in release mode")
	}
	if c.AllowDevAuth && c.AppEnv != "local" && c.AppEnv != "docker" {
		return fmt.Errorf("ALLOW_DEV_AUTH is only allowed in local/docker app env")
	}
	return nil
}

func getEnv(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

func getEnvAsInt(key string, fallback int) int {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return fallback
	}
	return n
}

func getEnvAsBool(key string, fallback bool) bool {
	v := strings.ToLower(strings.TrimSpace(os.Getenv(key)))
	if v == "" {
		return fallback
	}
	return v == "1" || v == "true" || v == "yes" || v == "y"
}

func splitCSV(s string) []string {
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	if len(out) == 0 {
		return []string{"*"}
	}
	return out
}
