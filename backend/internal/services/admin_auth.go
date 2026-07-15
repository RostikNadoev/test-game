package services

import (
	"crypto/subtle"
	"errors"
	"strings"
	"tg-lobbies-base/internal/config"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

var (
	ErrAdminDisabled       = errors.New("admin panel disabled")
	ErrAdminInvalidCreds   = errors.New("invalid admin credentials")
	ErrAdminNotConfigured  = errors.New("admin credentials not configured")
)

type AdminClaims struct {
	Username string `json:"username"`
	Role     string `json:"role"`
	jwt.RegisteredClaims
}

func AdminConfigured(cfg *config.Config) bool {
	if cfg == nil || !cfg.AdminEnabled {
		return false
	}
	return cfg.AdminPassword != "" || cfg.AdminPasswordHash != ""
}

func VerifyAdminPassword(cfg *config.Config, password string) error {
	if !AdminConfigured(cfg) {
		if cfg.GinMode != "release" && password == "admin" {
			return nil
		}
		return ErrAdminNotConfigured
	}
	if cfg.AdminPasswordHash != "" {
		if bcrypt.CompareHashAndPassword([]byte(cfg.AdminPasswordHash), []byte(password)) != nil {
			return ErrAdminInvalidCreds
		}
		return nil
	}
	if subtle.ConstantTimeCompare([]byte(cfg.AdminPassword), []byte(password)) != 1 {
		return ErrAdminInvalidCreds
	}
	return nil
}

func GenerateAdminJWT(username string, cfg *config.Config) (string, error) {
	now := time.Now().UTC()
	ttl := cfg.AdminJWTTTLHours
	if ttl <= 0 {
		ttl = 12
	}
	claims := AdminClaims{
		Username: username,
		Role:     "admin",
		RegisteredClaims: jwt.RegisteredClaims{
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(time.Duration(ttl) * time.Hour)),
			Issuer:    "tg-lobbies-admin",
			Subject:   "admin",
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(cfg.AdminJWTSecret))
}

func ParseAdminJWT(tokenString string, cfg *config.Config) (string, error) {
	claims := &AdminClaims{}
	token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (any, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return []byte(cfg.AdminJWTSecret), nil
	})
	if err != nil || !token.Valid || claims.Role != "admin" || strings.TrimSpace(claims.Username) == "" {
		return "", errors.New("invalid admin token")
	}
	return claims.Username, nil
}

func HashAdminPassword(password string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(hash), nil
}
