-- Hot database (member game lists, game reports, small cached documents). Same shape as the production database
-- `cynosure-hot`; used to set up the dev copy (`cynosure-hot-dev`).
CREATE TABLE IF NOT EXISTS member_games (
  openfront_id TEXT PRIMARY KEY,
  games TEXT NOT NULL,
  game_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  digest TEXT
);
CREATE TABLE IF NOT EXISTS game_detail (
  game_id TEXT PRIMARY KEY,
  detail TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS blobs (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
