-- Schema for the gdot-telemetry D1 database (binding: TELEMETRY).
-- For local dev:
--   npx wrangler d1 execute gdot-telemetry --local --file=worker/telemetry-schema.sql
CREATE TABLE IF NOT EXISTS games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  received_at TEXT NOT NULL,
  player_id TEXT,
  level_id TEXT,
  game_complete INTEGER,
  duration_sec REAL,
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_games_level ON games(level_id);
CREATE INDEX IF NOT EXISTS idx_games_received ON games(received_at);
