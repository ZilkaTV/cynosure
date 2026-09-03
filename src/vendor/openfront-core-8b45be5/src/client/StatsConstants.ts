// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 8b45be57542f5f8cce8380c4a75d816674a1dabe.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/8b45be57542f5f8cce8380c4a75d816674a1dabe/src/client/StatsConstants.ts
// Unmodified copy - see src/vendor/openfront-core-8b45be5/README.md.
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
