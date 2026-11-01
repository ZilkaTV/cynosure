-- "I am in the ranked queue right now": a member says so on the Live Ranked Queue page so the other members of the clan know and do not queue
-- into them. A row counts for 20 minutes. Run once on the real database (the dev database got it already).
CREATE TABLE IF NOT EXISTS cyn_queue_presence (
  openfront_id TEXT PRIMARY KEY,
  ladder TEXT NOT NULL,                  -- 1v1 | 2v2 | ffa
  since TEXT NOT NULL
);
