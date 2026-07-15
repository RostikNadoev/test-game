# TGbot

Telegram bot for TwinGames Mini App.

## Features

- `/start` — welcome message + Web App button
- `/play` — open games
- `/help` — command list
- Menu button (left of input) opens the Mini App
- `GET /health` — container health check

## Environment

See [`.env.example`](.env.example):

- `TELEGRAM_BOT_TOKEN` — same token as backend auth validation
- `FRONTEND_PUBLIC_URL` — public Mini App URL (from root `PUBLIC_URL`)
- `BOT_MENU_TEXT` — menu button label (default: `Играть`)
- `PORT` — health server port (default `8090`)

## Run locally

```bash
cd tgbot
export TELEGRAM_BOT_TOKEN=...
export FRONTEND_PUBLIC_URL=https://tw1ngames.duckdns.org
go run ./cmd/bot
```

## Docker

Built as `tgbot` service in root `docker-compose.yml`.

```bash
docker-compose up -d --build tgbot
docker-compose logs -f tgbot
```
