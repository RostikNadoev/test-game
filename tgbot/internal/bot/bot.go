package bot

import (
	"context"
	"fmt"
	"log"
	"os"
	"strings"

	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api/v5"
)

type Service struct {
	api          *tgbotapi.BotAPI
	frontendURL  string
	menuText     string
}

func New(token, frontendURL, menuText string) (*Service, error) {
	api, err := tgbotapi.NewBotAPI(token)
	if err != nil {
		return nil, fmt.Errorf("init bot api: %w", err)
	}

	api.Debug = strings.EqualFold(strings.TrimSpace(getEnv("BOT_DEBUG", "")), "true")

	if err := configureBot(api, frontendURL, menuText); err != nil {
		return nil, err
	}

	log.Printf("authorized as @%s", api.Self.UserName)

	return &Service{
		api:         api,
		frontendURL: frontendURL,
		menuText:    menuText,
	}, nil
}

func (s *Service) Run(ctx context.Context) error {
	updateCfg := tgbotapi.NewUpdate(0)
	updateCfg.Timeout = 30

	updates := s.api.GetUpdatesChan(updateCfg)

	for {
		select {
		case <-ctx.Done():
			s.api.StopReceivingUpdates()
			return nil
		case update, ok := <-updates:
			if !ok {
				return nil
			}
			s.handleUpdate(update)
		}
	}
}

func (s *Service) handleUpdate(update tgbotapi.Update) {
	if update.Message == nil {
		return
	}

	message := update.Message
	if !message.IsCommand() {
		s.sendPlayPrompt(message.Chat.ID)
		return
	}

	switch message.Command() {
	case "start":
		s.sendWelcome(message.Chat.ID, message.From)
	case "help":
		s.sendHelp(message.Chat.ID)
	case "play":
		s.sendWelcome(message.Chat.ID, message.From)
	default:
		s.sendHelp(message.Chat.ID)
	}
}

func (s *Service) sendWelcome(chatID int64, user *tgbotapi.User) {
	name := "игрок"
	if user != nil {
		if strings.TrimSpace(user.FirstName) != "" {
			name = user.FirstName
		} else if strings.TrimSpace(user.UserName) != "" {
			name = "@" + user.UserName
		}
	}

	text := fmt.Sprintf(
		"Привет, %s!\n\nTwinGames — PvP и solo-игры прямо в Telegram.\n\nНажми «%s», чтобы открыть мини-приложение.",
		name,
		s.menuText,
	)

	msg := tgbotapi.NewMessage(chatID, text)
	msg.ReplyMarkup = playKeyboard(s.frontendURL, s.menuText)

	if _, err := s.api.Send(msg); err != nil {
		log.Printf("send welcome failed: %v", err)
	}
}

func (s *Service) sendHelp(chatID int64) {
	text := strings.Join([]string{
		"Команды:",
		"/start — приветствие и кнопка входа",
		"/play — открыть игры",
		"/help — эта справка",
		"",
		"Также можно нажать кнопку меню «" + s.menuText + "» слева от поля ввода.",
	}, "\n")

	msg := tgbotapi.NewMessage(chatID, text)
	msg.ReplyMarkup = playKeyboard(s.frontendURL, s.menuText)

	if _, err := s.api.Send(msg); err != nil {
		log.Printf("send help failed: %v", err)
	}
}

func (s *Service) sendPlayPrompt(chatID int64) {
	msg := tgbotapi.NewMessage(chatID, "Открой игры через кнопку ниже или команду /play.")
	msg.ReplyMarkup = playKeyboard(s.frontendURL, s.menuText)

	if _, err := s.api.Send(msg); err != nil {
		log.Printf("send play prompt failed: %v", err)
	}
}

func playKeyboard(frontendURL, menuText string) any {
	return map[string]any{
		"inline_keyboard": [][]map[string]any{
			{
				{
					"text": "🎮 " + menuText,
					"web_app": map[string]string{
						"url": frontendURL,
					},
				},
			},
		},
	}
}

func getEnv(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}
