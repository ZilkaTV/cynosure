// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit e9e10703e8188f2a34defdeda9598778a934094a.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/e9e10703e8188f2a34defdeda9598778a934094a/src/client/StatsConstants.ts
// Unmodified copy - see src/vendor/openfront-core-e9e1070/README.md.
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
