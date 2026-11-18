// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit dd85bcfb8b20e599fae15298bf56db1e92947f61.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/dd85bcfb8b20e599fae15298bf56db1e92947f61/packages/engine/src/game/RailNetwork.ts
// Modified for this vendor build (scripts/vendor-engine-packages.mjs): workspace package imports (@openfront/*, resources/*) rewritten to relative paths.
import { TileRef } from "./GameMap";
import { UnitType } from "./GameTypes";
import { Unit } from "./Game";
import { StationManager } from "./RailNetworkImpl";
import { TrainStation } from "./TrainStation";

export interface RailNetwork {
  connectStation(station: TrainStation): void;
  removeStation(unit: Unit): void;
  findStationsPath(from: TrainStation, to: TrainStation): TrainStation[];
  stationManager(): StationManager;
  overlappingRailroads(unitType: UnitType, tile: TileRef): TileRef[];
  computeGhostRailPaths(unitType: UnitType, tile: TileRef): TileRef[][];
  recomputeClusters(): void;
  /** Digest of every station and rail, for the game-state hash. */
  hash(): number;
}
