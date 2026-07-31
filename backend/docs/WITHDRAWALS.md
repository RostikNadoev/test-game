# Manual GAME -> TON withdrawals

Withdrawals use a dedicated private Telegram bot. This bot is separate from the
Mini App bot configured through `TELEGRAM_BOT_TOKEN`.

## Environment

Add these values to the root `.env` used by Docker Compose:

```dotenv
WITHDRAWAL_BOT_TOKEN=token_from_BotFather_for_the_separate_bot
WITHDRAWAL_ADMIN_CHAT_ID=0
WITHDRAWAL_ADMIN_USER_ID=0
```

Do not commit the real token. Keep the server file private:

```bash
chmod 600 .env
```

Start the backend with the token first:

```bash
docker compose up -d --build backend
docker compose logs -f backend
```

Open the separate bot in Telegram and send `/chatid`. The bot replies with the
current `Chat ID` and `User ID`. Put both values into `.env`, then recreate the
backend container:

```bash
docker compose up -d --force-recreate backend
```

For a private chat, both IDs normally have the same positive value. Setting the
user ID ensures that only that Telegram account can press the completion button.

## Production migration

Apply the versioned migration before deploying the updated backend:

```bash
docker compose up -d postgres
docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < backend/migrations/003_withdrawals.sql
```

Then rebuild the application services:

```bash
docker compose up -d --build backend frontend
```

## Lifecycle

1. The user submits a positive whole GAME amount and the TON Connect wallet address.
2. The backend atomically deducts/reserves GAME and creates a pending request.
3. The dedicated bot receives an active request card with profile, amounts, wallet copy button, and `Отправил` button.
4. Pressing `Отправил` atomically completes the request and edits the Telegram card.
5. Wallet history polls the backend and changes from `Pending` to `Completed`.

Telegram delivery is retried every 15 seconds while a pending request has not yet
received a bot message.
