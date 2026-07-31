-- Manual GAME -> TON withdrawal requests handled through a separate admin bot.

CREATE TABLE IF NOT EXISTS withdrawal_requests (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    wallet_transaction_id BIGINT,
    idempotency_key VARCHAR(80) NOT NULL,
    wallet_address VARCHAR(128) NOT NULL,
    game_amount BIGINT NOT NULL,
    ton_nano_amount BIGINT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    bot_chat_id BIGINT NOT NULL DEFAULT 0,
    bot_message_id INTEGER NOT NULL DEFAULT 0,
    bot_notified_at TIMESTAMPTZ,
    bot_notification_error TEXT,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_user_id ON withdrawal_requests (user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_wallet_transaction_id ON withdrawal_requests (wallet_transaction_id);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_status ON withdrawal_requests (status);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_bot_message_id ON withdrawal_requests (bot_message_id);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_created_at ON withdrawal_requests (created_at);
