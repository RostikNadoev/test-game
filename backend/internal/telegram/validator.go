package telegram

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"
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
	values, err := url.ParseQuery(initData)
	if err != nil {
		return nil, fmt.Errorf("parse init_data: %w", err)
	}

	if !allowDevAuth {
		if strings.TrimSpace(botToken) == "" {
			return nil, errors.New("telegram bot token is empty")
		}
		if err := validateSignature(values, botToken); err != nil {
			return nil, err
		}
		if maxAge > 0 {
			authDate, err := authDateFromValues(values)
			if err != nil {
				return nil, err
			}
			if time.Since(authDate) > maxAge {
				return nil, errors.New("init_data expired")
			}
		}
	}

	parsed, err := parse(values)
	if err != nil {
		return nil, err
	}
	return parsed, nil
}

func validateSignature(values url.Values, botToken string) error {
	gotHash := values.Get("hash")
	if gotHash == "" {
		return errors.New("hash is missing")
	}

	pairs := make([]string, 0, len(values))
	for key, vals := range values {
		if key == "hash" || key == "signature" {
			continue
		}
		if len(vals) == 0 {
			continue
		}
		pairs = append(pairs, key+"="+vals[0])
	}
	sort.Strings(pairs)
	dataCheckString := strings.Join(pairs, "\n")

	secretMAC := hmac.New(sha256.New, []byte("WebAppData"))
	_, _ = secretMAC.Write([]byte(botToken))
	secret := secretMAC.Sum(nil)

	mac := hmac.New(sha256.New, secret)
	_, _ = mac.Write([]byte(dataCheckString))
	expected := hex.EncodeToString(mac.Sum(nil))

	if !hmac.Equal([]byte(expected), []byte(gotHash)) {
		return errors.New("invalid telegram signature")
	}
	return nil
}

func parse(values url.Values) (*ParsedInitData, error) {
	rawUser := values.Get("user")
	if rawUser == "" {
		return nil, errors.New("user is missing in init_data")
	}

	var user WebAppUser
	if err := json.Unmarshal([]byte(rawUser), &user); err != nil {
		return nil, fmt.Errorf("parse user json: %w", err)
	}
	if user.ID == 0 {
		return nil, errors.New("telegram user id is empty")
	}

	authDate, _ := authDateFromValues(values)
	return &ParsedInitData{
		User:       user,
		StartParam: values.Get("start_param"),
		AuthDate:   authDate,
	}, nil
}

func authDateFromValues(values url.Values) (time.Time, error) {
	raw := values.Get("auth_date")
	if raw == "" {
		return time.Time{}, errors.New("auth_date is missing")
	}
	unix, err := strconv.ParseInt(raw, 10, 64)
	if err != nil {
		return time.Time{}, errors.New("auth_date is invalid")
	}
	return time.Unix(unix, 0), nil
}
