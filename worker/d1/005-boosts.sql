-- How many server boosts a member has (Discord only says "boosts", not how often): the Factor Wheel gives +3 per boost.
-- The role-sync job only adds / removes the row, so the counts below stay as they are. Run once per database.
ALTER TABLE cyn_boosters ADD COLUMN boosts INTEGER NOT NULL DEFAULT 1;

-- Boosters at 2026-10-29: Zilka 2, Chuma 2, Kaizeron 2, Tim21 3
INSERT OR REPLACE INTO cyn_boosters (openfront_id, boosts) VALUES ('qNZMiEyR', 2), ('1tZwM07g', 2), ('rMovLSI8', 2), ('bgec4uk9', 3);
