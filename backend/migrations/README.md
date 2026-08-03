# Database migrations

This folder contains versioned SQL migrations for PostgreSQL.

## Rollout strategy

| Environment | Schema source |
|-------------|---------------|
| Local / Docker dev | GORM `AutoMigrate` on startup (convenience) |
| Production / staging | Apply SQL files from this folder explicitly |

`AutoMigrate` in [internal/database/postgres.go](../internal/database/postgres.go) is a **temporary bootstrap aid** for developers. Production deployments must not rely on it as the only schema source.

## Apply manually

```powershell
# From repo root, with postgres reachable:
psql "host=localhost user=postgres password=postgres dbname=tg_lobbies port=5432 sslmode=disable" -f backend/migrations/001_baseline.sql
psql "host=localhost user=postgres password=postgres dbname=tg_lobbies port=5432 sslmode=disable" -f backend/migrations/002_admin.sql
psql "host=localhost user=postgres password=postgres dbname=tg_lobbies port=5432 sslmode=disable" -f backend/migrations/003_withdrawals.sql
psql "host=localhost user=postgres password=postgres dbname=tg_lobbies port=5432 sslmode=disable" -f backend/migrations/004_pvp_min_bet.sql
psql "host=localhost user=postgres password=postgres dbname=tg_lobbies port=5432 sslmode=disable" -f backend/migrations/005_referrals.sql
```

Or via Docker:

```powershell
docker compose exec postgres psql -U postgres -d tg_lobbies -f /path/in/container/001_baseline.sql
```

## Tables in baseline

`001_baseline.sql` creates all tables required by [internal/models/models.go](../internal/models/models.go):

- `users`, `user_stats`, `user_solo_stats`
- `wallet_transactions`, `bet_reservations`
- `matches`, `match_finish_votes`
- `lobby_records`, `lobby_player_records`
- `solo_rounds`, `solo_sessions`

## Verification

Run backend tests after changing migrations:

```powershell
cd backend
go test ./...
```

A migration smoke test lives in `backend/migrations/migrations_test.go` and checks that the baseline SQL defines every required table name.

## Next step

Wire `golang-migrate` or `goose` in CI before removing `AutoMigrate` from production startup.
