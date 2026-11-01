-- "Invite a friend": a new member can name, once and for good, the member who brought them to the site; that member can then collect one booster
-- per named friend (the quest at the top of the Quests page). Run once on the real database (the dev database got it already).
CREATE TABLE IF NOT EXISTS cyn_referrals (
  referred_id TEXT PRIMARY KEY,          -- the member who was brought in (one referrer only, never changed)
  referrer_id TEXT NOT NULL,             -- the member who brought them
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  claimed_at TEXT                        -- when the referrer collected the booster for it
);
CREATE INDEX IF NOT EXISTS cyn_referrals_referrer ON cyn_referrals (referrer_id, claimed_at);
