# TwinGames — Telegram Mini App monorepo

Monorepo layout:

```txt
frontend/   React + Vite Mini App
backend/    Go API + WebSocket (blackjack)
tgbot/      Telegram bot placeholder
nginx/      Single public entrypoint
```

All services run in Docker on the internal network `twingames_app`. Externally only nginx is exposed.

## Quick start (Docker)

```powershell
copy .env.example .env
# fill TELEGRAM_BOT_TOKEN and JWT_SECRET

docker compose up --build
```

Open:

```txt
http://localhost/
http://localhost/health
```

The frontend uses same-origin API routes:

```txt
/api/v1/...
/ws/blackjack/...
```

## Local development (frontend + backend)

Terminal 1 — infrastructure and API:

```powershell
docker compose up postgres backend
```

Terminal 2 — Vite dev server with proxy:

```powershell
cd frontend
copy .env.example .env
npm install
npm run dev
```

Vite proxies `/api`, `/ws`, and `/health` to `http://localhost:8080`.

For backend outside Docker, copy `backend/.env.example` to `backend/.env` and set `DATABASE_DSN` with `host=localhost port=5433` if you expose postgres via a debug profile.

## BotFather / Mini App

Set the Mini App URL to your public `PUBLIC_URL` (the nginx entrypoint), for example:

```txt
https://your-domain.com/
```

Use the same `TELEGRAM_BOT_TOKEN` in root `.env` for backend Telegram auth validation.

## API documentation

See [backend/docs/FRONTEND_API.md](backend/docs/FRONTEND_API.md).

## TGbot

The `tgbot` service is currently a health stub. See [tgbot/README.md](tgbot/README.md).
