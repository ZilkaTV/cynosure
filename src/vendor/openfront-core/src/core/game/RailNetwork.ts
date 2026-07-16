// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit dcc18d5231af6253b0e991bf04a4c764982fe262.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/dcc18d5231af6253b0e991bf04a4c764982fe262/src/core/game/RailNetwork.ts
// Unmodified copy - see src/vendor/openfront-core/README.md.
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
