-- Upvotes for the skins, flags and crowns of the Skin Shop page: one vote per member and item (key = "pattern:<id>", "flag:<id>" or "crown:<id>").
-- Run once on the real database (the dev database got it already).
CREATE TABLE IF NOT EXISTS cyn_skin_votes (
  voter_id TEXT NOT NULL,
  item_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (voter_id, item_key)
);
CREATE INDEX IF NOT EXISTS cyn_skin_votes_item ON cyn_skin_votes (item_key);
