package telegram

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"testing"
	"time"
)

func signInitData(values url.Values, botToken string) string {
	pairs := make([]string, 0, len(values))
	for key, vals := range values {
		if key == "hash" || key == "signature" || len(vals) == 0 {
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
	return hex.EncodeToString(mac.Sum(nil))
}

func TestValidateAndParseValidSignature(t *testing.T) {
	botToken := "123456789:AAExampleToken"
	userJSON := `{"id":4242,"username":"testplayer","first_name":"Test"}`
	authDate := strconv.FormatInt(time.Now().Unix(), 10)

	values := url.Values{}
	values.Set("query_id", "AAEAAAE")
	values.Set("user", userJSON)
	values.Set("auth_date", authDate)
	values.Set("hash", signInitData(values, botToken))

	initData := values.Encode()
	parsed, err := ValidateAndParse(initData, botToken, time.Hour, false)
	if err != nil {
		t.Fatalf("validate: %v", err)
	}
	if parsed.User.ID != 4242 {
		t.Fatalf("user id = %d, want 4242", parsed.User.ID)
	}
	if parsed.User.Username != "testplayer" {
		t.Fatalf("username = %q", parsed.User.Username)
	}
}

func TestValidateAndParseInvalidSignature(t *testing.T) {
	initData := "user=%7B%22id%22%3A1%7D&auth_date=1700000000&hash=deadbeef"
	_, err := ValidateAndParse(initData, "123456789:AAExampleToken", time.Hour, false)
	if err == nil {
		t.Fatal("expected invalid signature error")
	}
}

func TestValidateAndParseDevAuthSkipsSignature(t *testing.T) {
	initData := "user=%7B%22id%22%3A99%2C%22username%22%3A%22dev%22%7D&auth_date=1700000000"
	parsed, err := ValidateAndParse(initData, "", 0, true)
	if err != nil {
		t.Fatalf("dev auth: %v", err)
	}
	if parsed.User.ID != 99 {
		t.Fatalf("user id = %d", parsed.User.ID)
	}
}
