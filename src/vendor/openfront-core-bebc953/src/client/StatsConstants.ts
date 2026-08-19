// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit bebc953804e5ef2834642a21bb602eb9014a3a12.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/bebc953804e5ef2834642a21bb602eb9014a3a12/src/client/StatsConstants.ts
// Unmodified copy - see src/vendor/openfront-core-bebc953/README.md.
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
