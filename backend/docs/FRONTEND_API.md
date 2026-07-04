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
  "amount": 3
}
```

Response 200:

```json
{
  "success": true,
  "exchanged": 3,
  "balance": {
    "ton": 7,
    "game": 8
  }
}
```

Errors:

```json
{ "error": "amount must be greater than 0" }
{ "error": "insufficient TON balance" }
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
- Пока лобби хранятся in-memory. После рестарта backend активные лобби очищаются.

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
