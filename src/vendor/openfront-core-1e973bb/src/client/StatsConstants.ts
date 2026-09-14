// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 1e973bb534b8b37d8d30c80ab27ad1391a7b82da.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/1e973bb534b8b37d8d30c80ab27ad1391a7b82da/src/client/StatsConstants.ts
// Unmodified copy - see src/vendor/openfront-core-1e973bb/README.md.
export const COLUMN_IDS = [
  // Identity (only clan is hideable; rank/player/team are not).
  "rank",
  "clan",
  "player",
  "playerType",
  "team",
  // Territory.
  "tiles",
  // Economy: balance, then its per-source income rates.
  "gold",
  "goldIncomePerMin",
  "shipTradeGoldPerMin",
  "piracyGoldPerMin",
  "trainTradeGoldPerMin",
  // Military.
  "troops",
  "maxtroops",
  // Buildings & units.
  "cities",
  "ports",
  "factories",
  "silos",
  "sams",
  "warships",
  // Diplomacy.
  "allies",
  "betrayals",
] as const;

export type ColumnId = (typeof COLUMN_IDS)[number];

export const DEFAULT_STATS_COLUMNS = {
  player: ["clan", "tiles", "gold", "maxtroops"],
  team: ["tiles", "gold", "maxtroops"],
} as const satisfies Record<StatsTableKind, readonly ColumnId[]>;

export type StatsTableKind = "player" | "team";
