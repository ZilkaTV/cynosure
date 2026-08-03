// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 7a7ca5be8ff8af4403595e4766b2669ab8124407.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/7a7ca5be8ff8af4403595e4766b2669ab8124407/src/client/StatsConstants.ts
// Unmodified copy - see src/vendor/openfront-core-7a7ca5b/README.md.
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
