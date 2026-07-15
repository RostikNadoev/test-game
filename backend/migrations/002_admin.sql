-- Admin panel: user blocking, game settings, audit logs.

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked_reason TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked_by_admin TEXT;

CREATE INDEX IF NOT EXISTS idx_users_is_blocked ON users (is_blocked);

CREATE TABLE IF NOT EXISTS game_settings (
    code TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    title TEXT NOT NULL,
    min_bet DOUBLE PRECISION NOT NULL DEFAULT 1,
    max_bet DOUBLE PRECISION NOT NULL DEFAULT 500,
    maintenance_message TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_game_settings_kind ON game_settings (kind);
CREATE INDEX IF NOT EXISTS idx_game_settings_enabled ON game_settings (enabled);

CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id BIGSERIAL PRIMARY KEY,
    admin_username TEXT NOT NULL,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id TEXT,
    reason TEXT,
    before_json JSONB NOT NULL DEFAULT '{}',
    after_json JSONB NOT NULL DEFAULT '{}',
    ip TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_action ON admin_audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at ON admin_audit_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_target ON admin_audit_logs (target_type, target_id);
