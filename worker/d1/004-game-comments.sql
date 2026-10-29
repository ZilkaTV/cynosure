-- Comments under a game's post-game report (replies via parent_id) and the emoji reactions on those comments.
CREATE TABLE IF NOT EXISTS cyn_game_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id TEXT NOT NULL,
  parent_id INTEGER,
  author_openfront_id TEXT NOT NULL,
  author_name TEXT,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS cyn_game_comments_game ON cyn_game_comments (game_id);

CREATE TABLE IF NOT EXISTS cyn_comment_reactions (
  comment_id INTEGER NOT NULL,
  openfront_id TEXT NOT NULL,
  emoji TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (comment_id, openfront_id, emoji)
);
