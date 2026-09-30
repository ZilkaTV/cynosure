// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit d7075bface21e6835fadb7a0d0025455f8bc358a.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/d7075bface21e6835fadb7a0d0025455f8bc358a/src/client/StatsConstants.ts
// Unmodified copy - see src/vendor/openfront-core-d7075bf/README.md.
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
