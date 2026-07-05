package config_test

import (
	"testing"

	"tg-lobbies-base/internal/config"
)

func TestValidateRejectsDefaultJWTInRelease(t *testing.T) {
	cfg := &config.Config{
		GinMode:    "release",
		JWTSecret:  "change_me",
		AppEnv:     "docker",
	}
	if err := cfg.Validate(); err == nil {
		t.Fatal("expected validation error for default JWT secret in release")
	}
}

func TestValidateAllowsDevAuthInDocker(t *testing.T) {
	cfg := &config.Config{
		GinMode:      "debug",
		JWTSecret:    "secret",
		AllowDevAuth: true,
		AppEnv:       "docker",
	}
	if err := cfg.Validate(); err != nil {
		t.Fatalf("expected dev auth in docker to be allowed, got %v", err)
	}
}
