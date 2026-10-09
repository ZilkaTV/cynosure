-- One-off for the existing database: marks speedruns whose time the engine replay verified.
-- Run once:  npx wrangler d1 execute cynosure --remote --file worker/d1/002-speedrun-verified.sql
ALTER TABLE cyn_speedruns ADD COLUMN verified INTEGER NOT NULL DEFAULT 0;
