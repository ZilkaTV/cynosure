// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit b716adb7e2f1396e8b5ae80730ac052e6f5638ce.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/b716adb7e2f1396e8b5ae80730ac052e6f5638ce/src/core/game/RailNetwork.ts
// Unmodified copy - see src/vendor/openfront-core-b716adb/README.md.
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
