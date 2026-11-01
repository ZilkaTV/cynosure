-- "@Name" in a comment notifies that member: one row per mentioned member, written together with the comment (worker/mentions.js).
-- Run once on the real database (and on the dev database).
CREATE TABLE IF NOT EXISTS cyn_mentions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mentioned_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  comment_id INTEGER,
  ref_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS cyn_mentions_mentioned ON cyn_mentions (mentioned_id, created_at);
