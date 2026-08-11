// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit ad765842bac44be72a8dc91a9e23369f8fa57744.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/ad765842bac44be72a8dc91a9e23369f8fa57744/src/core/game/RailNetwork.ts
// Unmodified copy - see src/vendor/openfront-core-ad76584/README.md.
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
