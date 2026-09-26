// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit a188868bc16c25caa2d3b5b5cb4b929663f7b5ad.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/a188868bc16c25caa2d3b5b5cb4b929663f7b5ad/src/client/StatsConstants.ts
// Unmodified copy - see src/vendor/openfront-core-a188868/README.md.
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
