# TGbot (placeholder)

This folder is reserved for the Telegram bot service.

## Planned responsibilities

- `/start` command and welcome flow
- Menu Button / Web App URL setup via Bot API
- Optional webhooks and payment notifications

## Environment

See [`.env.example`](.env.example):

- `TELEGRAM_BOT_TOKEN` — same token as backend auth validation
- `FRONTEND_PUBLIC_URL` — public Mini App URL (nginx entrypoint)
- `PORT` — stub health server port (default `8090`)

## Current state

The container runs a minimal HTTP stub with:

```txt
GET /health -> {"status":"stub","service":"tgbot"}
```

Bot logic will be added later.
