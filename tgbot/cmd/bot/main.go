package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"tgbot/internal/bot"
	"tgbot/internal/config"
	"tgbot/internal/health"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	botService, err := bot.New(cfg.TelegramBotToken, cfg.FrontendPublicURL, cfg.BotMenuText)
	if err != nil {
		log.Fatalf("bot: %v", err)
	}

	healthServer := health.New(cfg.Port)
	go healthServer.Start()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go func() {
		if err := botService.Run(ctx); err != nil {
			log.Printf("bot stopped: %v", err)
			stop()
		}
	}()

	log.Printf("tgbot running (mini app: %s)", cfg.FrontendPublicURL)

	<-ctx.Done()

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := healthServer.Shutdown(shutdownCtx); err != nil {
		log.Printf("health shutdown: %v", err)
	}
}
