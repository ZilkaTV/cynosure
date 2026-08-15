// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 87f1a5278c8e1409ce0cdcf183d30a6d806364d2.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/87f1a5278c8e1409ce0cdcf183d30a6d806364d2/src/core/game/RailNetwork.ts
// Unmodified copy - see src/vendor/openfront-core-87f1a52/README.md.
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
