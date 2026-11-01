-- FFA Elo in the daily member snapshots (profile trends). Run once per database before the refresh job writes it.
ALTER TABLE cyn_member_snapshots ADD COLUMN elo_ffa INTEGER;
