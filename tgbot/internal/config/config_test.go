package config

import "testing"

func TestLoadRequiresToken(t *testing.T) {
	t.Setenv("TELEGRAM_BOT_TOKEN", "")
	t.Setenv("FRONTEND_PUBLIC_URL", "https://example.com")

	if _, err := Load(); err == nil {
		t.Fatal("expected error for missing token")
	}
}

func TestLoadTrimsPublicURL(t *testing.T) {
	t.Setenv("TELEGRAM_BOT_TOKEN", "123:abc")
	t.Setenv("FRONTEND_PUBLIC_URL", "https://example.com/")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if cfg.FrontendPublicURL != "https://example.com" {
		t.Fatalf("url = %q", cfg.FrontendPublicURL)
	}
}
