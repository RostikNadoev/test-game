package bot

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api/v5"
)

func configureBot(api *tgbotapi.BotAPI, frontendURL, menuText string) error {
	commands := tgbotapi.NewSetMyCommands(
		tgbotapi.BotCommand{Command: "start", Description: "Запустить бота"},
		tgbotapi.BotCommand{Command: "help", Description: "Справка"},
		tgbotapi.BotCommand{Command: "play", Description: "Открыть игры"},
	)
	if _, err := api.Request(commands); err != nil {
		return fmt.Errorf("setMyCommands: %w", err)
	}

	if err := setDefaultMenuButton(api.Token, menuText, frontendURL); err != nil {
		return fmt.Errorf("setChatMenuButton: %w", err)
	}

	return nil
}

func setDefaultMenuButton(token, text, frontendURL string) error {
	payload := map[string]any{
		"menu_button": map[string]any{
			"type": "web_app",
			"text": text,
			"web_app": map[string]string{
				"url": frontendURL,
			},
		},
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	req, err := http.NewRequest(http.MethodPost, fmt.Sprintf("https://api.telegram.org/bot%s/setChatMenuButton", token), bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 15 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()

	var response struct {
		OK          bool   `json:"ok"`
		Description string `json:"description"`
	}
	if err := json.NewDecoder(res.Body).Decode(&response); err != nil {
		return err
	}
	if !response.OK {
		return fmt.Errorf("%s", response.Description)
	}

	return nil
}
