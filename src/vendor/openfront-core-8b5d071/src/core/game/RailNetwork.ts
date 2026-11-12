// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 8b5d071eed95f07c701b32e4c64e95b03f8577c1.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/8b5d071eed95f07c701b32e4c64e95b03f8577c1/packages/engine/src/game/RailNetwork.ts
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
