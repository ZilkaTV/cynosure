// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 577819ba0e1e13ecdbc8dede2ba33de542c88a67.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/577819ba0e1e13ecdbc8dede2ba33de542c88a67/src/client/StatsConstants.ts
// Unmodified copy - see src/vendor/openfront-core-577819b/README.md.
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
