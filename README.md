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

## Verification

```powershell
cd backend
go test ./...

cd ../frontend
npm ci
npm run lint
npm run test
npm run build
```

## Notes

- Public entrypoint is root `nginx/` (`docker-compose.yml`). The standalone `frontend/nginx.conf` serves static assets only.
- TON → GAME exchange is temporarily disabled until a payment provider confirms transfers.
- PvP match payout requires both players to submit matching finish votes through `POST /api/v1/matches/finish`. Conflicting votes settle as draw/refund.
- Solo session games support resume via `GET /api/v1/solo/sessions/active?game=...` and return `public_state` for UI restoration.
- Solo session games support manual abandon via `POST /api/v1/solo/sessions/:id/abandon`.
- Local dev funding: `POST /api/v1/dev/grant-game` when `ALLOW_DEV_AUTH=true` (never in release).
- Production schema: apply `backend/migrations/001_baseline.sql` explicitly; AutoMigrate is dev-only bootstrap.
- In-memory rate limiting is single-instance only; use a shared store before horizontal scaling.
- Recommended PR split before merge: (1) infra/docs/CI/migrations, (2) backend wallet/solo/match, (3) frontend solo/session/wallet, (4) tests and cleanup.

## TGbot

The `tgbot` service is currently a health stub. See [tgbot/README.md](tgbot/README.md).
