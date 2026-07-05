# Backend API для фронта Telegram Mini App

Фронт отдельный. Backend не раздает фронт и не открывает Mini App. В BotFather/Menu Button вставляется ссылка на фронт.

## Базовая схема подключения

1. Пользователь открывает Telegram Mini App по ссылке фронта.
2. Фронт берет `window.Telegram.WebApp.initData`.
3. Фронт отправляет `init_data` на backend: `POST /api/v1/auth/telegram`.
4. Backend валидирует Telegram initData по `TELEGRAM_BOT_TOKEN`.
5. Backend возвращает JWT.
6. Все REST-запросы идут с `Authorization: Bearer <jwt>`.
7. Лобби работают через REST. WebSocket для лобби больше не используется.

## Base URL

```txt
API_BASE=https://BACKEND_DOMAIN
FRONTEND_URL=https://FRONTEND_DOMAIN
```

Локально:

```txt
API_BASE=http://localhost:8080
```

---

## Авторизация Telegram

### POST `/api/v1/auth/telegram`

Auth: не нужен.

Request:

```json
{
  "init_data": "query_id=...&user=...&auth_date=...&hash=..."
}
```

Frontend JS:

```js
const initData = window.Telegram.WebApp.initData;

const res = await fetch(`${API_BASE}/api/v1/auth/telegram`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ init_data: initData })
});

const data = await res.json();
localStorage.setItem("token", data.token);
```

Response 200:

```json
{
  "token": "jwt_token",
  "user": {
    "id": 1,
    "telegram_id": 123456789,
    "tg_user": "@username",
    "photo_url": "https://...",
    "balance_ton": 0,
    "balance_game": 0,
    "stats": {
      "rating": 1000,
      "wins": 0,
      "losses": 0,
      "total_games": 0,
      "winrate": 0,
      "favorite_mode": "none"
    },
    "created_at": "2026-06-08T20:00:00Z"
  }
}
```

Errors:

```json
{ "error": "init_data is required" }
{ "error": "invalid telegram data" }
```

---

## Текущий пользователь

### GET `/api/v1/auth/me`

Headers:

```txt
Authorization: Bearer <jwt>
```

Response 200: такой же `user`, как в auth.

---

## Профиль

### GET `/api/v1/users/profile`

Headers:

```txt
Authorization: Bearer <jwt>
```

Response 200:

```json
{
  "user": {
    "id": 1,
    "telegram_id": 123456789,
    "tg_user": "@username",
    "photo_url": "https://...",
    "balance_ton": 10,
    "balance_game": 5,
    "stats": {
      "rating": 1000,
      "wins": 0,
      "losses": 0,
      "total_games": 0,
      "winrate": 0,
      "favorite_mode": "none"
    },
    "created_at": "2026-06-08T20:00:00Z"
  }
}
```

---

## Баланс

### GET `/api/v1/users/balance`

Headers:

```txt
Authorization: Bearer <jwt>
```

Response 200:

```json
{
  "balance": {
    "ton": 10,
    "game": 5
  }
}
```

---

## Статистика

### GET `/api/v1/users/stats`

Headers:

```txt
Authorization: Bearer <jwt>
```

Response 200:

```json
{
  "stats": {
    "rating": 1000,
    "wins": 0,
    "losses": 0,
    "total_games": 0,
    "winrate": 0,
    "favorite_mode": "none"
  }
}
```

---

## Обмен TON на игровые коины

### POST `/api/v1/wallet/exchange-ton-to-game`

Headers:

```txt
Authorization: Bearer <jwt>
```

Request:

```json
{
  "coins": 5
}
```

Response 200:

```json
{
  "success": true,
  "rate": "1 GAME = 0.1 TON",
  "coins": 5,
  "spent_ton": 0.5,
  "balance_game": 8,
  "balance": {
    "game": 8
  }
}
```

Errors:

```json
{ "error": "coins amount must be >= 1" }
```

> MVP: TON не списывается с баланса, endpoint начисляет GAME для тестов.

---

### POST `/api/v1/wallet/topup-quote`

Headers:

```txt
Authorization: Bearer <jwt>
```

Request:

```json
{
  "coins": 100
}
```

Response 200:

```json
{
  "coins": 100,
  "required_ton": 10,
  "rate": "1 GAME = 0.1 TON"
}
```

---

### POST `/api/v1/dev/grant-game` (только dev)

Доступен когда `GIN_MODE != release` и `ALLOW_DEV_AUTH=true`.

Headers:

```txt
Authorization: Bearer <jwt>
```

Request:

```json
{
  "coins": 1000
}
```

Response 200:

```json
{
  "success": true,
  "coins": 1000,
  "balance": {
    "ton": 0,
    "game": 1000
  }
}
```

---

# Лобби

Лобби теперь полностью через REST. `/ws/lobbies` удален из backend-контракта.

Общие правила:

- `mode` фронт не отправляет.
- `max_players` фронт не отправляет.
- Все лобби строго на 2 игрока.
- `game` можно отправлять и с `_`, и с `-`: `plinko_pvp` / `plinko-pvp`.
- Активные статусы: `waiting`, `playing`.
- `finished` в списках активных лобби не возвращается.
- Лобби сохраняются в PostgreSQL и восстанавливаются после рестарта backend (`waiting` / `playing`).
- При create/join ставка (`bet_coins`) резервируется с `balance_game`. При leave до старта — возврат.
- В DTO лобби есть `players_info` с `id`, `tg_user`, `photo_url`.
- Для WS-игр в join/create ответе может быть `ws_url`.

## Список игр

### GET `/api/v1/lobbies/games`

Headers:

```txt
Authorization: Bearer <jwt>
```

Response 200:

```json
{
  "games": [
    { "code": "plinko_pvp", "display_name": "Plinko PvP" },
    { "code": "descent_duel", "display_name": "Descent Duel" },
    { "code": "paper_io", "display_name": "Paper IO" },
    { "code": "tower_stack", "display_name": "Tower Stack" },
    { "code": "crash_duel", "display_name": "Crash Duel" },
    { "code": "virus_market", "display_name": "Virus Market" },
    { "code": "rps_duel", "display_name": "RPS Duel" },
    { "code": "grid_lock", "display_name": "Grid Lock" },
    { "code": "blackjack_duel", "display_name": "Blackjack Duel" },
    { "code": "dice_duel", "display_name": "Dice Duel" },
    { "code": "neon_matrix", "display_name": "Neon Matrix" },
    { "code": "street_race", "display_name": "Street Race" },
    { "code": "air_hockey", "display_name": "Air Hockey" }
  ],
  "count": 13
}
```

---

## Создать лобби

### POST `/api/v1/lobbies/create`

Headers:

```txt
Authorization: Bearer <jwt>
Content-Type: application/json
```

Request:

```json
{
  "name": "My lobby",
  "game": "plinko_pvp",
  "bet_coins": 5
}
```

Response 200:

```json
{
  "lobby": {
    "id": "a7f3b8c1d2e9f001",
    "name": "My lobby",
    "game": "plinko_pvp",
    "status": "waiting",
    "bet_coins": 5,
    "max_players": 2,
    "player_count": 1,
    "players": [1],
    "players_info": [
      { "id": 1, "tg_user": "@username", "photo_url": "https://..." }
    ],
    "created_by": 1,
    "created_at": "2026-06-08T20:00:00Z",
    "updated_at": "2026-06-08T20:00:00Z"
  }
}
```

Errors:

```json
{ "error": "name is required" }
{ "error": "game is required" }
{ "error": "unsupported game" }
{ "error": "bet_coins must be greater than 0" }
{ "error": "insufficient balance" }
{ "error": "user already has active lobby" }
```

---

## Получить все активные лобби

### GET `/api/v1/lobbies/active`

Headers:

```txt
Authorization: Bearer <jwt>
```

Response 200:

```json
{
  "lobbies": [
    {
      "id": "a7f3b8c1d2e9f001",
      "name": "My lobby",
      "game": "plinko_pvp",
      "status": "waiting",
      "bet_coins": 5,
      "max_players": 2,
      "player_count": 1,
      "players": [1],
      "created_by": 1,
      "created_at": "2026-06-08T20:00:00Z",
      "updated_at": "2026-06-08T20:00:00Z"
    }
  ],
  "count": 1
}
```

---

## Получить активные лобби по игре

Можно через path:

### GET `/api/v1/lobbies/active/plinko-pvp`

Или через query:

### GET `/api/v1/lobbies/active?game=plinko_pvp`

Headers:

```txt
Authorization: Bearer <jwt>
```

Response 200:

```json
{
  "game": "plinko_pvp",
  "lobbies": [],
  "count": 0
}
```

Поддерживаемые path-методы:

```txt
GET /api/v1/lobbies/active/plinko-pvp
GET /api/v1/lobbies/active/descent-duel
GET /api/v1/lobbies/active/paper-io
GET /api/v1/lobbies/active/tower-stack
GET /api/v1/lobbies/active/crash-duel
GET /api/v1/lobbies/active/virus-market
GET /api/v1/lobbies/active/rps-duel
GET /api/v1/lobbies/active/grid-lock
GET /api/v1/lobbies/active/blackjack-duel
GET /api/v1/lobbies/active/dice-duel
GET /api/v1/lobbies/active/neon-matrix
GET /api/v1/lobbies/active/street-race
GET /api/v1/lobbies/active/air-hockey
```

---

## Получить одно лобби по ID

### GET `/api/v1/lobbies/item/:id`

Headers:

```txt
Authorization: Bearer <jwt>
```

Response 200:

```json
{
  "lobby": {
    "id": "a7f3b8c1d2e9f001",
    "name": "My lobby",
    "game": "plinko_pvp",
    "status": "waiting",
    "bet_coins": 5,
    "max_players": 2,
    "player_count": 1,
    "players": [1],
    "players_info": [
      { "id": 1, "tg_user": "@username", "photo_url": "https://..." }
    ],
    "created_by": 1,
    "created_at": "2026-06-08T20:00:00Z",
    "updated_at": "2026-06-08T20:00:00Z"
  }
}
```

Error:

```json
{ "error": "lobby not found" }
```

---

## Войти в лобби

### POST `/api/v1/lobbies/join`

Headers:

```txt
Authorization: Bearer <jwt>
Content-Type: application/json
```

Request:

```json
{
  "lobby_id": "a7f3b8c1d2e9f001"
}
```

Response 200, если второй игрок вошел и лобби заполнено:

```json
{
  "success": true,
  "lobby": {
    "id": "a7f3b8c1d2e9f001",
    "name": "My lobby",
    "game": "plinko_pvp",
    "status": "playing",
    "bet_coins": 5,
    "max_players": 2,
    "player_count": 2,
    "players": [1, 2],
    "players_info": [
      { "id": 1, "tg_user": "@host", "photo_url": "" },
      { "id": 2, "tg_user": "@guest", "photo_url": "" }
    ],
    "ws_url": "wss://BACKEND_DOMAIN/ws/plinko/LOBBY_ID?token=JWT",
    "created_by": 1,
    "created_at": "2026-06-08T20:00:00Z",
    "updated_at": "2026-06-08T20:01:00Z"
  }
}
```

Errors:

```json
{ "error": "lobby not found" }
{ "error": "lobby is not waiting" }
{ "error": "lobby is full" }
{ "error": "insufficient balance" }
{ "error": "user already has active lobby" }
```

---

## Выйти из лобби

### POST `/api/v1/lobbies/leave`

Headers:

```txt
Authorization: Bearer <jwt>
Content-Type: application/json
```

Request:

```json
{
  "lobby_id": "a7f3b8c1d2e9f001"
}
```

Response 200, если лобби осталось существовать:

```json
{
  "success": true,
  "deleted": false,
  "lobby": {
    "id": "a7f3b8c1d2e9f001",
    "name": "My lobby",
    "game": "plinko_pvp",
    "status": "waiting",
    "bet_coins": 5,
    "max_players": 2,
    "player_count": 1,
    "players": [1],
    "players_info": [
      { "id": 1, "tg_user": "@username", "photo_url": "https://..." }
    ],
    "created_by": 1,
    "created_at": "2026-06-08T20:00:00Z",
    "updated_at": "2026-06-08T20:02:00Z"
  }
}
```

Response 200, если лобби удалилось, потому что игроков больше нет:

```json
{
  "success": true,
  "deleted": true
}
```

Errors:

```json
{ "error": "lobby not found" }
{ "error": "user is not in lobby" }
```

---

## Завершение матча (client-authoritative игры)

### POST `/api/v1/matches/finish`

Headers:

```txt
Authorization: Bearer <jwt>
Content-Type: application/json
```

Request:

```json
{
  "lobby_id": "a7f3b8c1d2e9f001",
  "game": "plinko_pvp",
  "winner_user_id": 2
}
```

`winner_user_id: null` — ничья (обе ставки возвращаются).

Response 200:

```json
{
  "success": true,
  "balance": {
    "ton": 0,
    "game": 19
  },
  "stats": {
    "rating": 1025,
    "wins": 1,
    "losses": 0,
    "total_games": 1,
    "winrate": 100,
    "favorite_mode": "plinko_pvp"
  }
}
```

Errors:

```json
{ "error": "lobby not found" }
{ "error": "lobby is not playing" }
{ "error": "user is not in this lobby" }
{ "error": "game mismatch" }
{ "error": "winner is not in lobby" }
{ "error": "match not found" }
```

> Blackjack (`blackjack_duel`) завершается автоматически на сервере через WS callback.

---

## Leaderboard

### GET `/api/v1/leaderboard?limit=50`

Headers:

```txt
Authorization: Bearer <jwt>
```

Response 200:

```json
{
  "players": [
    {
      "id": 1,
      "tg_user": "@username",
      "photo_url": "https://...",
      "rating": 1025,
      "wins": 12
    }
  ],
  "count": 1
}
```

---

## WebSocket игры

Для `blackjack_duel`, `plinko_pvp`, `paper_io`, `street_race`, `tower_stack`:

```txt
GET /ws/blackjack/:lobby_id?token=<jwt>
GET /ws/plinko/:lobby_id?token=<jwt>
GET /ws/paper-io/:lobby_id?token=<jwt>
GET /ws/street-race/:lobby_id?token=<jwt>
GET /ws/tower-stack/:lobby_id?token=<jwt>
```

После join лобби в `playing` фронт может взять `ws_url` из ответа REST.

Blackjack — authoritative game server. Остальные WS-игры используют координатор (start/relay/finish); settlement всё равно через escrow + `matches/finish` или WS finish event.

---

## Solo games API

Server-authoritative solo games: instant spins and session-based risk games. Все операции списывают/начисляют `balance_game`. Solo-статистика отдельна от PvP `rating`.

### GET `/api/v1/solo/games`

Headers:

```txt
Authorization: Bearer <jwt>
```

Response 200:

```json
{
  "games": [
    {
      "code": "neon_scratch",
      "title": "Neon Scratch",
      "mode": "instant",
      "min_bet": 1,
      "max_bet": 500
    }
  ],
  "count": 5
}
```

Коды игр: `neon_scratch`, `fruit_cascade` (instant); `royal_5x5`, `crystal_mines`, `turbo_tower` (session).

### POST `/api/v1/solo/spin`

Instant-игры. Атомарно: debit → server RNG → credit → `SoloRound` + solo stats.

Body:

```json
{
  "game": "neon_scratch",
  "bet_coins": 10,
  "idempotency_key": "optional-client-key"
}
```

Header (альтернатива): `Idempotency-Key: <key>`

Response 200:

```json
{
  "success": true,
  "round_id": "abc123",
  "game": "neon_scratch",
  "bet_coins": 10,
  "payout_coins": 13,
  "net_coins": 3,
  "outcome": {},
  "balance": { "game": 103 },
  "solo_stats": {
    "total_spins": 1,
    "total_wagered": 10,
    "total_won": 13,
    "biggest_win": 13,
    "favorite_solo_game": "neon_scratch",
    "last_played_at": "2026-07-05T00:00:00Z"
  }
}
```

Errors:

```json
{ "error": "insufficient balance" }
{ "error": "invalid bet amount" }
{ "error": "unsupported solo game" }
```

### POST `/api/v1/solo/sessions`

Старт session-игры. Списывает ставку сразу. Один active session на `(user, game)`.

Body:

```json
{
  "game": "royal_5x5",
  "bet_coins": 10
}
```

Response 200:

```json
{
  "success": true,
  "session_id": "def456",
  "game": "royal_5x5",
  "bet_coins": 10,
  "status": "active",
  "multiplier": 1,
  "opened_steps": 0,
  "balance": { "game": 90 },
  "solo_stats": {}
}
```

Errors:

```json
{ "error": "active solo session already exists" }
```

### POST `/api/v1/solo/sessions/:id/step`

Body:

```json
{
  "action": "pick",
  "payload": { "row": 0, "col": 2 }
}
```

Payload по играм:

| Game | payload |
|------|---------|
| `royal_5x5` | `{ "row": 0..6, "col": 0..4 }` |
| `crystal_mines` | `{ "cell_index": 0..24 }` |
| `turbo_tower` | `{ "floor": 0..7, "door": 0..2 }` |

Response 200 — поля как у start + `event`, при settle также `payout_coins`. `event.status`: `playing` | `bust` | `completed`.

### POST `/api/v1/solo/sessions/:id/cashout`

Без body. Доступен после хотя бы одного safe pick.

Response 200:

```json
{
  "success": true,
  "session_id": "def456",
  "status": "cashed_out",
  "payout_coins": 11,
  "balance": { "game": 101 },
  "solo_stats": {}
}
```

### GET `/api/v1/solo/stats`

Response 200:

```json
{
  "solo_stats": {
    "total_spins": 12,
    "total_wagered": 120,
    "total_won": 98,
    "biggest_win": 45,
    "favorite_solo_game": "fruit_cascade",
    "last_played_at": "2026-07-05T00:00:00Z"
  }
}
```

### GET `/api/v1/solo/history?game=neon_scratch&limit=20`

Response 200:

```json
{
  "rounds": [
    {
      "id": "...",
      "game": "neon_scratch",
      "bet_coins": 10,
      "payout_coins": 0,
      "net_coins": -10,
      "outcome_json": "{}",
      "created_at": "..."
    }
  ],
  "count": 1
}
```

> Abandoned active sessions старше 30 минут автоматически expire с refund ставки (`solo_refund`).

---

## Проверочный сценарий для фронта

1. Открыть Mini App из Telegram.
2. `POST /api/v1/auth/telegram` → получить JWT.
3. `GET /api/v1/users/profile` → показать профиль.
4. `GET /api/v1/lobbies/games` → отрисовать вкладки игр.
5. `GET /api/v1/lobbies/active/plinko-pvp` → показать лобби конкретной игры.
6. Первый аккаунт: `POST /api/v1/lobbies/create`.
7. Второй аккаунт: `GET /api/v1/lobbies/active/plinko-pvp`, взять `lobby.id`.
8. Второй аккаунт: `POST /api/v1/lobbies/join`.
9. В ответе на join лобби станет `status: "playing"`.

Для автообновления списка лобби без сокета фронт может polling-ом раз в 2–5 секунд дергать:

```txt
GET /api/v1/lobbies/active/<game>
```
