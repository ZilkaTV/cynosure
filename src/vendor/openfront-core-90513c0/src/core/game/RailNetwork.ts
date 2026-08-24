// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 90513c0bffeb8e74a83e76c7a99e3b136f433f87.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/90513c0bffeb8e74a83e76c7a99e3b136f433f87/src/core/game/RailNetwork.ts
// Unmodified copy - see src/vendor/openfront-core-90513c0/README.md.
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
