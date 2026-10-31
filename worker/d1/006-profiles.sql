-- Profile pages like a Steam profile: own icon (avatar), banner (pictures and GIFs), a short "about me", likes and a comment wall.
-- Run once on the real database (the dev database got it already when the feature was built).
ALTER TABLE cyn_members ADD COLUMN avatar_url TEXT;
ALTER TABLE cyn_members ADD COLUMN banner_url TEXT;
ALTER TABLE cyn_members ADD COLUMN bio TEXT;

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
