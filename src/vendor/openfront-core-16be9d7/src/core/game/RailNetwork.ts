// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 16be9d7c15d7abc115691def3a0b2aa559664705.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/16be9d7c15d7abc115691def3a0b2aa559664705/src/core/game/RailNetwork.ts
// Unmodified copy - see src/vendor/openfront-core-16be9d7/README.md.
import { Unit, UnitType } from "./Game";
import { TileRef } from "./GameMap";
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
}
