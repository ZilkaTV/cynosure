// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit fe5d7708e03ac08c1a62c2eb694e58d564f86ab4.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/fe5d7708e03ac08c1a62c2eb694e58d564f86ab4/src/core/game/RailNetwork.ts
// Unmodified copy - see src/vendor/openfront-core-fe5d770/README.md.
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
