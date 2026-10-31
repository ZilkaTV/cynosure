-- Player cards and boosters: every member has a card (made from the site's stats); boosters hold cards of members in different rarities.
-- Run once on the real database (the dev database got it already when the feature was built).

-- One row per member: boosters on hand and when the free one of the day was taken
CREATE TABLE IF NOT EXISTS cyn_booster_state (
  openfront_id TEXT PRIMARY KEY,
  extra INTEGER NOT NULL DEFAULT 0,      -- boosters on hand besides the free daily one (starter booster, granted by an admin)
  last_free_day TEXT,                    -- Berlin date (YYYY-MM-DD) of the last free booster
  last_open_at TEXT,                     -- ISO time of the last booster that was opened (free or not), for the daily quest
  opened_total INTEGER NOT NULL DEFAULT 0
);

-- Every card that was pulled: whose booster, which member the card shows, in which rarity
CREATE TABLE IF NOT EXISTS cyn_card_pulls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  openfront_id TEXT NOT NULL,            -- the collector
  booster_id TEXT NOT NULL,              -- the cards of one booster share it
  card_id TEXT NOT NULL,                 -- the member the card shows
  rarity TEXT NOT NULL,                  -- common | rare | epic | ultra | legendary
  source TEXT NOT NULL,                  -- free | extra
  pulled_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS cyn_card_pulls_owner ON cyn_card_pulls (openfront_id, pulled_at);
