export const INTEGRATION_SCHEMA = [
 `CREATE TABLE IF NOT EXISTS api_tokens (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, folder_id TEXT NOT NULL, name TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, can_write INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, revoked_at INTEGER, last_used_at INTEGER, rate_window INTEGER NOT NULL DEFAULT 0, rate_count INTEGER NOT NULL DEFAULT 0)`,
 `CREATE INDEX IF NOT EXISTS idx_api_tokens_user ON api_tokens(user_id, created_at)`,
 `CREATE TABLE IF NOT EXISTS api_audit (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token_id TEXT NOT NULL, operation TEXT NOT NULL, status INTEGER NOT NULL, created_at INTEGER NOT NULL)`,
 `CREATE INDEX IF NOT EXISTS idx_api_audit_user ON api_audit(user_id, created_at)`,
] as const
