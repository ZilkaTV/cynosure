-- Cards a member shows on the own profile (picked in the collection with the tick): at most 8 per member.
-- Run once on the real database (the dev database got it already when the feature was built).
CREATE TABLE IF NOT EXISTS cyn_profile_cards (
  openfront_id TEXT NOT NULL,            -- the member whose profile shows the card
  card_id TEXT NOT NULL,                 -- the member the card shows
  rarity TEXT NOT NULL,                  -- common | rare | epic | ultra | legendary
  added_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (openfront_id, card_id, rarity)
);
