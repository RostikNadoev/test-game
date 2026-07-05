# tg-lobbies-base backend

Go API for the Telegram Mini App.

## Run with Docker (recommended)

From the repository root:

```powershell
docker compose up --build
```

## Run locally (without Docker)

```powershell
copy .env.example .env
docker compose up postgres
go mod tidy
go run ./cmd/server
```

Health check:

```txt
http://localhost:8080/health
```

When using the full stack, API is available through nginx at `/api/v1/...`.

Versioned SQL migrations live in [migrations/](migrations/). AutoMigrate still runs on startup for local bootstrap, but production should apply SQL migrations explicitly.

## API docs

See [docs/FRONTEND_API.md](docs/FRONTEND_API.md).
