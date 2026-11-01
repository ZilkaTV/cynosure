-- The sign-in lookups ("which member is this account", "is this Discord name an admin") read the cyn_members table row by row. Indexes make each of them one row
-- on D1's free plan, where the rows read per day are limited. Run once on the real database (and on the dev database).
CREATE INDEX IF NOT EXISTS idx_members_user_id ON cyn_members (user_id);
CREATE INDEX IF NOT EXISTS idx_members_discord_username ON cyn_members (discord_username);
