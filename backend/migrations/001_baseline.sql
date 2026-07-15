-- Baseline schema snapshot for TwinGames / tg-lobbies-base.
-- Production should apply these migrations explicitly instead of relying only on GORM AutoMigrate.

CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    telegram_id BIGINT NOT NULL UNIQUE,
    username TEXT,
    first_name TEXT,
    last_name TEXT,
    display_name TEXT,
    photo_url TEXT,
    balance_ton DOUBLE PRECISION NOT NULL DEFAULT 0,
    balance_game DOUBLE PRECISION NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);

CREATE TABLE IF NOT EXISTS user_stats (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL UNIQUE,
    rating INTEGER NOT NULL DEFAULT 1000,
    wins INTEGER NOT NULL DEFAULT 0,
    losses INTEGER NOT NULL DEFAULT 0,
    favorite_mode TEXT NOT NULL DEFAULT 'none',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_stats_user_id ON user_stats (user_id);

CREATE TABLE IF NOT EXISTS user_solo_stats (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL UNIQUE,
    total_spins INTEGER NOT NULL DEFAULT 0,
    total_wagered DOUBLE PRECISION NOT NULL DEFAULT 0,
    total_won DOUBLE PRECISION NOT NULL DEFAULT 0,
    biggest_win DOUBLE PRECISION NOT NULL DEFAULT 0,
    favorite_solo_game TEXT NOT NULL DEFAULT 'none',
    last_played_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_solo_stats_user_id ON user_solo_stats (user_id);

CREATE TABLE IF NOT EXISTS wallet_transactions (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    type TEXT NOT NULL,
    currency TEXT NOT NULL,
    amount DOUBLE PRECISION NOT NULL,
    status TEXT NOT NULL DEFAULT 'completed',
    meta JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_id ON wallet_transactions (user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_type ON wallet_transactions (type);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_currency ON wallet_transactions (currency);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_status ON wallet_transactions (status);

CREATE TABLE IF NOT EXISTS bet_reservations (
    id BIGSERIAL PRIMARY KEY,
    lobby_id TEXT NOT NULL,
    user_id BIGINT NOT NULL,
    amount DOUBLE PRECISION NOT NULL,
    status TEXT NOT NULL DEFAULT 'reserved',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (lobby_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_bet_reservations_lobby_id ON bet_reservations (lobby_id);
CREATE INDEX IF NOT EXISTS idx_bet_reservations_user_id ON bet_reservations (user_id);
CREATE INDEX IF NOT EXISTS idx_bet_reservations_status ON bet_reservations (status);

CREATE TABLE IF NOT EXISTS matches (
    id BIGSERIAL PRIMARY KEY,
    lobby_id TEXT NOT NULL UNIQUE,
    game TEXT NOT NULL,
    bet_coins DOUBLE PRECISION NOT NULL,
    player1_id BIGINT NOT NULL,
    player2_id BIGINT NOT NULL,
    winner_user_id BIGINT,
    status TEXT NOT NULL DEFAULT 'playing',
    settled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_matches_game ON matches (game);
CREATE INDEX IF NOT EXISTS idx_matches_player1_id ON matches (player1_id);
CREATE INDEX IF NOT EXISTS idx_matches_player2_id ON matches (player2_id);
CREATE INDEX IF NOT EXISTS idx_matches_winner_user_id ON matches (winner_user_id);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches (status);

CREATE TABLE IF NOT EXISTS match_finish_votes (
    id BIGSERIAL PRIMARY KEY,
    lobby_id TEXT NOT NULL,
    user_id BIGINT NOT NULL,
    winner_user_id BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (lobby_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_match_finish_votes_lobby_id ON match_finish_votes (lobby_id);
CREATE INDEX IF NOT EXISTS idx_match_finish_votes_user_id ON match_finish_votes (user_id);
CREATE INDEX IF NOT EXISTS idx_match_finish_votes_winner_user_id ON match_finish_votes (winner_user_id);

CREATE TABLE IF NOT EXISTS lobby_records (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    game TEXT NOT NULL,
    status TEXT NOT NULL,
    bet_coins DOUBLE PRECISION NOT NULL,
    max_players INTEGER NOT NULL DEFAULT 2,
    created_by BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lobby_records_game ON lobby_records (game);
CREATE INDEX IF NOT EXISTS idx_lobby_records_status ON lobby_records (status);
CREATE INDEX IF NOT EXISTS idx_lobby_records_created_by ON lobby_records (created_by);

CREATE TABLE IF NOT EXISTS lobby_player_records (
    id BIGSERIAL PRIMARY KEY,
    lobby_id TEXT NOT NULL,
    user_id BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (lobby_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_lobby_player_records_lobby_id ON lobby_player_records (lobby_id);
CREATE INDEX IF NOT EXISTS idx_lobby_player_records_user_id ON lobby_player_records (user_id);

CREATE TABLE IF NOT EXISTS solo_rounds (
    id TEXT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    game TEXT NOT NULL,
    bet_coins DOUBLE PRECISION NOT NULL,
    payout_coins DOUBLE PRECISION NOT NULL,
    net_coins DOUBLE PRECISION NOT NULL,
    outcome_json JSONB NOT NULL DEFAULT '{}',
    idempotency_key TEXT,
    status TEXT NOT NULL DEFAULT 'settled',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_solo_rounds_user_id ON solo_rounds (user_id);
CREATE INDEX IF NOT EXISTS idx_solo_rounds_game ON solo_rounds (game);
CREATE INDEX IF NOT EXISTS idx_solo_rounds_status ON solo_rounds (status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_solo_round_user_idempotency ON solo_rounds (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS solo_sessions (
    id TEXT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    game TEXT NOT NULL,
    bet_coins DOUBLE PRECISION NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    state_json JSONB NOT NULL DEFAULT '{}',
    current_multiplier DOUBLE PRECISION NOT NULL DEFAULT 1,
    opened_steps INTEGER NOT NULL DEFAULT 0,
    payout_coins DOUBLE PRECISION NOT NULL DEFAULT 0,
    settled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_solo_sessions_user_id ON solo_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_solo_sessions_game ON solo_sessions (game);
CREATE INDEX IF NOT EXISTS idx_solo_sessions_status ON solo_sessions (status);
