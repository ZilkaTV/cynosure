// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 1e973bb534b8b37d8d30c80ab27ad1391a7b82da.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/1e973bb534b8b37d8d30c80ab27ad1391a7b82da/src/core/game/RailNetwork.ts
// Unmodified copy - see src/vendor/openfront-core-1e973bb/README.md.
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
