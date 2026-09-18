// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 2be7dfe239ea26d01f566910fb6f50b059c89e8a.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/2be7dfe239ea26d01f566910fb6f50b059c89e8a/src/core/game/RailNetwork.ts
// Unmodified copy - see src/vendor/openfront-core-2be7dfe/README.md.
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
