// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit d53d6c339fefe0291782e1530242a771a44c9e91.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/d53d6c339fefe0291782e1530242a771a44c9e91/src/client/StatsConstants.ts
// Unmodified copy - see src/vendor/openfront-core-d53d6c3/README.md.
export const COLUMN_IDS = [
  "rank",
  "clan",
  "player",
  "team",
  "tiles",
  "gold",
  "troops",
  "maxtroops",
  "cities",
  "ports",
  "factories",
  "silos",
  "sams",
  "warships",
  "allies",
  "betrayals",
] as const;

export type ColumnId = (typeof COLUMN_IDS)[number];

export const DEFAULT_STATS_COLUMNS = {
  player: ["clan", "tiles", "gold", "maxtroops"],
  team: ["tiles", "gold", "maxtroops"],
} as const satisfies Record<StatsTableKind, readonly ColumnId[]>;

export type StatsTableKind = "player" | "team";
