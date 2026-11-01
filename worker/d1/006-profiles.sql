-- Profile pages like a Steam profile: own icon (avatar), banner (pictures and GIFs), a short "about me", likes and a comment wall.
-- Run once on the real database (the dev database got it already when the feature was built).
ALTER TABLE cyn_members ADD COLUMN avatar_url TEXT;
ALTER TABLE cyn_members ADD COLUMN banner_url TEXT;
ALTER TABLE cyn_members ADD COLUMN bio TEXT;
-- how the pictures are placed: "x,y,zoom" (x and y 0-100 percent, zoom 1-3), set by the owner with the mouse on the page
ALTER TABLE cyn_members ADD COLUMN avatar_fit TEXT;
ALTER TABLE cyn_members ADD COLUMN banner_fit TEXT;
-- the member's YouTube channel ("@handle" or a channel id) and Twitch channel (login name), shown on the profile
ALTER TABLE cyn_members ADD COLUMN yt_channel TEXT;
ALTER TABLE cyn_members ADD COLUMN twitch_channel TEXT;

CREATE TABLE IF NOT EXISTS cyn_profile_likes (
  profile_id TEXT NOT NULL,
  from_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (profile_id, from_id)
);

CREATE TABLE IF NOT EXISTS cyn_profile_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id TEXT NOT NULL,
  author_openfront_id TEXT NOT NULL,
  author_name TEXT,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS cyn_profile_comments_profile ON cyn_profile_comments (profile_id);

-- Reports of profiles and comments (members report, admins read and close them)
CREATE TABLE IF NOT EXISTS cyn_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_openfront_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  handled_by TEXT,
  handled_at TEXT
);
CREATE INDEX IF NOT EXISTS cyn_reports_status ON cyn_reports (status);

-- Indexes for the notification bell (who reacted to my games, who answered my comments)
CREATE INDEX IF NOT EXISTS cyn_kudos_to ON cyn_kudos (to_openfront_id, created_at);
CREATE INDEX IF NOT EXISTS cyn_game_comments_author ON cyn_game_comments (author_openfront_id);
CREATE INDEX IF NOT EXISTS cyn_game_comments_parent ON cyn_game_comments (parent_id);
