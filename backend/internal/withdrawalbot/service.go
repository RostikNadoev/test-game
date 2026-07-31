package withdrawalbot

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync/atomic"
	"time"

	"tg-lobbies-base/internal/models"
	"tg-lobbies-base/internal/services"

	"gorm.io/gorm"
)

const callbackPrefix = "withdrawal_done:"

type Service struct {
	db          *gorm.DB
	token       string
	adminChatID int64
	adminUserID int64
	client      *http.Client
	wake        chan struct{}
	ready       atomic.Bool
}

type apiResponse struct {
	OK          bool            `json:"ok"`
	Description string          `json:"description"`
	Result      json.RawMessage `json:"result"`
}

type telegramUpdate struct {
	UpdateID      int64                  `json:"update_id"`
	Message       *telegramMessage       `json:"message"`
	CallbackQuery *telegramCallbackQuery `json:"callback_query"`
}

type telegramMessage struct {
	MessageID int          `json:"message_id"`
	Text      string       `json:"text"`
	Chat      telegramChat `json:"chat"`
	From      telegramUser `json:"from"`
}

type telegramChat struct {
	ID int64 `json:"id"`
}

type telegramUser struct {
	ID        int64  `json:"id"`
	FirstName string `json:"first_name"`
	UserName  string `json:"username"`
}

type telegramCallbackQuery struct {
	ID      string           `json:"id"`
	From    telegramUser     `json:"from"`
	Message *telegramMessage `json:"message"`
	Data    string           `json:"data"`
}

type sentMessage struct {
	MessageID int `json:"message_id"`
}

func New(db *gorm.DB, token string, adminChatID, adminUserID int64) *Service {
	return &Service{
		db:          db,
		token:       strings.TrimSpace(token),
		adminChatID: adminChatID,
		adminUserID: adminUserID,
		client:      &http.Client{Timeout: 40 * time.Second},
		wake:        make(chan struct{}, 1),
	}
}

func (s *Service) Ready() bool {
	return s != nil && s.ready.Load()
}

func (s *Service) Wake() {
	if s == nil {
		return
	}
	select {
	case s.wake <- struct{}{}:
	default:
	}
}

func (s *Service) Run(ctx context.Context) {
	if s == nil || s.token == "" {
		log.Print("withdrawal bot is disabled: WITHDRAWAL_BOT_TOKEN is empty")
		return
	}

	if s.adminChatID == 0 {
		log.Print("withdrawal bot started in setup mode: send /chatid to the new bot")
	} else {
		log.Printf("withdrawal bot started for admin chat %d", s.adminChatID)
	}
	if err := s.call(ctx, "deleteWebhook", map[string]any{"drop_pending_updates": false}, nil); err != nil {
		log.Printf("withdrawal bot: deleteWebhook: %v", err)
	}
	if err := s.call(ctx, "getMe", map[string]any{}, nil); err != nil {
		log.Printf("withdrawal bot: authentication check failed: %v", err)
	} else if s.adminChatID != 0 {
		s.ready.Store(true)
	}

	go s.notificationLoop(ctx)
	s.pollUpdates(ctx)
}

func (s *Service) notificationLoop(ctx context.Context) {
	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()

	for {
		if s.Ready() {
			s.notifyPending(ctx)
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		case <-s.wake:
		}
	}
}

func (s *Service) notifyPending(ctx context.Context) {
	rows, err := services.ListUnnotifiedWithdrawals(s.db, 20)
	if err != nil {
		log.Printf("withdrawal bot: load pending notifications: %v", err)
		return
	}
	for _, details := range rows {
		messageID, sendErr := s.sendWithdrawalMessage(ctx, details)
		if sendErr != nil {
			_ = services.SetWithdrawalNotificationError(s.db, details.Request.ID, sendErr)
			log.Printf("withdrawal bot: notify request %d: %v", details.Request.ID, sendErr)
			continue
		}
		if err := services.MarkWithdrawalNotified(s.db, details.Request.ID, s.adminChatID, messageID); err != nil {
			log.Printf("withdrawal bot: persist message for request %d: %v", details.Request.ID, err)
		}
	}
}

func (s *Service) pollUpdates(ctx context.Context) {
	var offset int64
	for ctx.Err() == nil {
		var updates []telegramUpdate
		err := s.call(ctx, "getUpdates", map[string]any{
			"offset":          offset,
			"timeout":         25,
			"allowed_updates": []string{"message", "callback_query"},
		}, &updates)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			log.Printf("withdrawal bot: getUpdates: %v", err)
			time.Sleep(3 * time.Second)
			continue
		}
		if s.adminChatID != 0 {
			s.ready.Store(true)
		}
		for _, update := range updates {
			if update.UpdateID >= offset {
				offset = update.UpdateID + 1
			}
			s.handleUpdate(ctx, update)
		}
	}
}

func (s *Service) handleUpdate(ctx context.Context, update telegramUpdate) {
	if update.CallbackQuery != nil {
		s.handleCallback(ctx, update.CallbackQuery)
		return
	}
	if update.Message == nil {
		return
	}

	fields := strings.Fields(strings.TrimSpace(update.Message.Text))
	if len(fields) == 0 {
		return
	}
	command := strings.ToLower(fields[0])
	command = strings.SplitN(command, "@", 2)[0]
	if command != "/start" && command != "/chatid" && command != "/help" {
		return
	}

	configured := s.adminChatID != 0 && update.Message.Chat.ID == s.adminChatID
	status := "⚠️ Этот чат пока не назначен для заявок."
	if configured {
		status = "✅ Этот чат подключён к заявкам на вывод."
	}
	text := fmt.Sprintf(
		"<b>Withdrawal Admin Bot</b>\n\n%s\n\nChat ID: <code>%d</code>\nUser ID: <code>%d</code>\n\nСохрани эти значения в серверном .env и перезапусти backend.",
		status,
		update.Message.Chat.ID,
		update.Message.From.ID,
	)
	_ = s.sendText(ctx, update.Message.Chat.ID, text)
}

func (s *Service) handleCallback(ctx context.Context, callback *telegramCallbackQuery) {
	if callback.Message == nil || callback.Message.Chat.ID != s.adminChatID ||
		(s.adminUserID != 0 && callback.From.ID != s.adminUserID) {
		_ = s.answerCallback(ctx, callback.ID, "Нет доступа к этой заявке", true)
		return
	}
	if !strings.HasPrefix(callback.Data, callbackPrefix) {
		_ = s.answerCallback(ctx, callback.ID, "Неизвестное действие", true)
		return
	}

	requestID64, err := strconv.ParseUint(strings.TrimPrefix(callback.Data, callbackPrefix), 10, 64)
	if err != nil || requestID64 == 0 {
		_ = s.answerCallback(ctx, callback.ID, "Некорректный номер заявки", true)
		return
	}

	details, err := services.CompleteWithdrawal(s.db, uint(requestID64))
	if err != nil {
		log.Printf("withdrawal bot: complete request %d: %v", requestID64, err)
		_ = s.answerCallback(ctx, callback.ID, "Не удалось закрыть заявку", true)
		return
	}

	if err := s.editCompletedMessage(ctx, callback.Message.Chat.ID, callback.Message.MessageID, *details); err != nil {
		log.Printf("withdrawal bot: edit completed request %d: %v", requestID64, err)
	}
	_ = s.answerCallback(ctx, callback.ID, "Заявка отмечена как выполненная", false)
}

func (s *Service) sendWithdrawalMessage(ctx context.Context, details services.WithdrawalDetails) (int, error) {
	var result sentMessage
	err := s.call(ctx, "sendMessage", map[string]any{
		"chat_id":                  s.adminChatID,
		"text":                     withdrawalText(details, false),
		"parse_mode":               "HTML",
		"disable_web_page_preview": true,
		"reply_markup":             withdrawalKeyboard(details, true),
	}, &result)
	return result.MessageID, err
}

func (s *Service) editCompletedMessage(ctx context.Context, chatID int64, messageID int, details services.WithdrawalDetails) error {
	return s.call(ctx, "editMessageText", map[string]any{
		"chat_id":                  chatID,
		"message_id":               messageID,
		"text":                     withdrawalText(details, true),
		"parse_mode":               "HTML",
		"disable_web_page_preview": true,
		"reply_markup":             withdrawalKeyboard(details, false),
	}, nil)
}

func (s *Service) sendText(ctx context.Context, chatID int64, text string) error {
	return s.call(ctx, "sendMessage", map[string]any{
		"chat_id":    chatID,
		"text":       text,
		"parse_mode": "HTML",
	}, nil)
}

func (s *Service) answerCallback(ctx context.Context, callbackID, text string, alert bool) error {
	return s.call(ctx, "answerCallbackQuery", map[string]any{
		"callback_query_id": callbackID,
		"text":              text,
		"show_alert":        alert,
	}, nil)
}

func (s *Service) call(ctx context.Context, method string, payload any, result any) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	endpoint := fmt.Sprintf("https://api.telegram.org/bot%s/%s", s.token, method)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return errors.New("could not build Telegram request")
	}
	req.Header.Set("Content-Type", "application/json")

	response, err := s.client.Do(req)
	if err != nil {
		var requestErr *url.Error
		if errors.As(err, &requestErr) {
			return fmt.Errorf("Telegram request failed: %v", requestErr.Err)
		}
		return errors.New("Telegram request failed")
	}
	defer response.Body.Close()

	var envelope apiResponse
	if err := json.NewDecoder(response.Body).Decode(&envelope); err != nil {
		return err
	}
	if !envelope.OK {
		if envelope.Description == "" {
			envelope.Description = response.Status
		}
		return errors.New(envelope.Description)
	}
	if result != nil && len(envelope.Result) > 0 {
		return json.Unmarshal(envelope.Result, result)
	}
	return nil
}

func withdrawalText(details services.WithdrawalDetails, completed bool) string {
	request := details.Request
	status := "🟡 <b>АКТИВНАЯ ЗАЯВКА</b>"
	footer := "После перевода TON нажми кнопку <b>«Отправил»</b>."
	if completed || request.Status == models.WithdrawalStatusCompleted {
		status = "✅ <b>ЗАЯВКА ВЫПОЛНЕНА</b>"
		footer = "Заявка закрыта — в приложении отображается статус «Выполнено»."
	}

	profileURL := fmt.Sprintf("tg://user?id=%d", details.User.TelegramID)
	if username := strings.TrimPrefix(strings.TrimSpace(details.User.Username), "@"); username != "" {
		profileURL = "https://t.me/" + url.PathEscape(username)
	}
	name := strings.TrimSpace(details.User.DisplayName)
	if name == "" {
		name = strings.TrimSpace(details.User.FirstName + " " + details.User.LastName)
	}
	if name == "" {
		name = fmt.Sprintf("User %d", details.User.ID)
	}

	created := request.CreatedAt.In(time.FixedZone("MSK", 3*60*60)).Format("02.01.2006 · 15:04 MSK")
	completedLine := ""
	if request.CompletedAt != nil {
		completedLine = "\nВыполнена: <b>" + request.CompletedAt.In(time.FixedZone("MSK", 3*60*60)).Format("02.01.2006 · 15:04 MSK") + "</b>"
	}

	return fmt.Sprintf(
		"%s\n<b>#%d</b>\n\n👤 <a href=\"%s\">%s</a>\nTelegram ID: <code>%d</code>\n\n💰 Списано: <b>%d GAME</b>\n💎 Отправить: <b>%s TON</b>\n\nКошелёк:\n<code>%s</code>\n\nСоздана: <b>%s</b>%s\n\n%s",
		status,
		request.ID,
		html.EscapeString(profileURL),
		html.EscapeString(name),
		details.User.TelegramID,
		request.GameAmount,
		services.FormatTONNano(request.TonNanoAmount),
		html.EscapeString(request.WalletAddress),
		created,
		completedLine,
		footer,
	)
}

func withdrawalKeyboard(details services.WithdrawalDetails, active bool) map[string]any {
	profileURL := fmt.Sprintf("tg://user?id=%d", details.User.TelegramID)
	if username := strings.TrimPrefix(strings.TrimSpace(details.User.Username), "@"); username != "" {
		profileURL = "https://t.me/" + url.PathEscape(username)
	}
	rows := [][]map[string]any{
		{{
			"text":      "📋 Скопировать адрес",
			"copy_text": map[string]string{"text": details.Request.WalletAddress},
		}},
		{{
			"text": "👤 Открыть профиль",
			"url":  profileURL,
		}},
	}
	if active {
		rows = append(rows, []map[string]any{{
			"text":          "✅ Отправил",
			"callback_data": callbackPrefix + strconv.FormatUint(uint64(details.Request.ID), 10),
		}})
	}
	return map[string]any{"inline_keyboard": rows}
}
