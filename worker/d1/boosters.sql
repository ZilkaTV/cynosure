-- Members who boost the Discord server. Filled by scripts/discord-role-sync.mjs (Discord's premium_since flag); the site gives them
-- permanent access (no 7-day rule, src/lib/access.ts). Run once on the users database (cynosure, and cynosure-dev for the dev site):
--   npx wrangler d1 execute cynosure --remote --file worker/d1/boosters.sql
CREATE TABLE IF NOT EXISTS cyn_boosters (
  openfront_id TEXT PRIMARY KEY
);
