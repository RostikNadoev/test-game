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
		if key == "hash" || len(vals) == 0 {
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

func TestValidateAndParseEncodedInitDataString(t *testing.T) {
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
		t.Fatalf("validate encoded init data: %v", err)
	}
	if parsed.User.ID != 4242 {
		t.Fatalf("user id = %d, want 4242", parsed.User.ID)
	}
}

func TestValidateAndParseThirdPartySignature(t *testing.T) {
	const (
		initData = "user=%7B%22id%22%3A279058397%2C%22first_name%22%3A%22Vladislav%20%2B%20-%20%3F%20%5C%2F%22%2C%22last_name%22%3A%22Kibenko%22%2C%22username%22%3A%22vdkfrost%22%2C%22language_code%22%3A%22ru%22%2C%22is_premium%22%3Atrue%2C%22allows_write_to_pm%22%3Atrue%2C%22photo_url%22%3A%22https%3A%5C%2F%5C%2Ft.me%5C%2Fi%5C%2Fuserpic%5C%2F320%5C%2F4FPEE4tmP3ATHa57u6MqTDih13LTOiMoKoLDRG4PnSA.svg%22%7D&chat_instance=8134722200314281151&chat_type=private&auth_date=1733584787&hash=2174df5b000556d044f3f020384e879c8efcab55ddea2ced4eb752e93e7080d6&signature=zL-ucjNyREiHDE8aihFwpfR9aggP2xiAo3NSpfe-p7IbCisNlDKlo7Kb6G4D0Ao2mBrSgEk4maLSdv6MLIlADQ"
		botToken = "7342037359:AAExampleToken"
	)

	parsed, err := ValidateAndParse(initData, botToken, 0, false)
	if err != nil {
		t.Fatalf("validate third party init data: %v", err)
	}
	if parsed.User.ID != 279058397 {
		t.Fatalf("user id = %d, want 279058397", parsed.User.ID)
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
