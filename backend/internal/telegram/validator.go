package telegram

import (
	"errors"
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"time"

	initdata "github.com/telegram-mini-apps/init-data-golang"
)

type WebAppUser struct {
	ID        int64  `json:"id"`
	Username  string `json:"username"`
	FirstName string `json:"first_name"`
	LastName  string `json:"last_name"`
	PhotoURL  string `json:"photo_url"`
}

type ParsedInitData struct {
	User       WebAppUser
	StartParam string
	AuthDate   time.Time
}

func ValidateAndParse(initData string, botToken string, maxAge time.Duration, allowDevAuth bool) (*ParsedInitData, error) {
	initData = strings.TrimSpace(initData)
	if initData == "" {
		return nil, errors.New("init_data is empty")
	}

	if !allowDevAuth {
		if strings.TrimSpace(botToken) == "" {
			return nil, errors.New("telegram bot token is empty")
		}
		if err := validateInitData(initData, botToken, maxAge); err != nil {
			return nil, err
		}
	}

	parsed, err := initdata.Parse(initData)
	if err != nil {
		return nil, fmt.Errorf("parse init_data: %w", err)
	}
	if parsed.User.ID == 0 {
		return nil, errors.New("telegram user id is empty")
	}

	return &ParsedInitData{
		User: WebAppUser{
			ID:        parsed.User.ID,
			Username:  parsed.User.Username,
			FirstName: parsed.User.FirstName,
			LastName:  parsed.User.LastName,
			PhotoURL:  parsed.User.PhotoURL,
		},
		StartParam: parsed.StartParam,
		AuthDate:   parsed.AuthDate(),
	}, nil
}

func validateInitData(initData, botToken string, maxAge time.Duration) error {
	if err := initdata.Validate(initData, botToken, maxAge); err == nil {
		return nil
	} else if !hasSignatureField(initData) {
		return mapInitDataError(err)
	}

	botID, err := botIDFromToken(botToken)
	if err != nil {
		return err
	}

	if err := initdata.ValidateThirdParty(initData, botID, maxAge); err != nil {
		return mapInitDataError(err)
	}
	return nil
}

func hasSignatureField(initData string) bool {
	q, err := url.ParseQuery(initData)
	if err != nil {
		return false
	}
	return strings.TrimSpace(q.Get("signature")) != ""
}

func botIDFromToken(token string) (int64, error) {
	parts := strings.SplitN(token, ":", 2)
	if len(parts) == 0 || parts[0] == "" {
		return 0, errors.New("invalid telegram bot token format")
	}
	botID, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		return 0, fmt.Errorf("invalid telegram bot id: %w", err)
	}
	return botID, nil
}

func mapInitDataError(err error) error {
	switch {
	case errors.Is(err, initdata.ErrSignInvalid):
		return errors.New("invalid telegram signature")
	case errors.Is(err, initdata.ErrSignMissing):
		return errors.New("hash is missing")
	case errors.Is(err, initdata.ErrExpired):
		return errors.New("init_data expired")
	case errors.Is(err, initdata.ErrAuthDateMissing):
		return errors.New("auth_date is missing")
	case errors.Is(err, initdata.ErrAuthDateInvalid):
		return errors.New("auth_date is invalid")
	default:
		return err
	}
}
