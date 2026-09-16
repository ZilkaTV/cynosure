// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 222e4078982e6c21c620a69c82de0392c17385bf.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/222e4078982e6c21c620a69c82de0392c17385bf/src/core/game/RailNetwork.ts
// Unmodified copy - see src/vendor/openfront-core-222e407/README.md.
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
