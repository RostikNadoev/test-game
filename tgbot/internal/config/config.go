package config

import (
	"fmt"
	"os"
	"strings"
)

type Config struct {
	Port              string
	TelegramBotToken  string
	FrontendPublicURL string
	BotMenuText       string
}

func Load() (*Config, error) {
	cfg := &Config{
		Port:              getEnv("PORT", "8090"),
		TelegramBotToken:  strings.TrimSpace(os.Getenv("TELEGRAM_BOT_TOKEN")),
		FrontendPublicURL: strings.TrimRight(strings.TrimSpace(getEnv("FRONTEND_PUBLIC_URL", "https://tw1ngames.duckdns.org")), "/"),
		BotMenuText:       getEnv("BOT_MENU_TEXT", "Играть"),
	}

	if cfg.TelegramBotToken == "" {
		return nil, fmt.Errorf("TELEGRAM_BOT_TOKEN is required")
	}
	if cfg.FrontendPublicURL == "" {
		return nil, fmt.Errorf("FRONTEND_PUBLIC_URL is required")
	}

	return cfg, nil
}

func getEnv(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}
