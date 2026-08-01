// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 3fa1a8e0f1996c9efe786a62b5ff97a4d87779cd.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/3fa1a8e0f1996c9efe786a62b5ff97a4d87779cd/src/core/game/RailNetwork.ts
// Unmodified copy - see src/vendor/openfront-core-3fa1a8e/README.md.
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
