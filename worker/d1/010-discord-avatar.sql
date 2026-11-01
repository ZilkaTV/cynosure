-- The Discord icon of every member as the default profile picture (and the picture of the player card): the hash of the Discord avatar, kept up
-- to date by scripts/discord-role-sync.mjs. The picture itself is served by /api/avatars/<openfront id> (worker/avatars.js), so the Discord id
-- never reaches the browser. Run once on the real database (the dev database got it already).
ALTER TABLE cyn_members ADD COLUMN discord_avatar TEXT;
