// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 53e1a5b03e35c27a3130c1c534f9416b8d6c724f.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/53e1a5b03e35c27a3130c1c534f9416b8d6c724f/src/core/game/RailNetwork.ts
// Unmodified copy - see src/vendor/openfront-core-53e1a5b/README.md.
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
