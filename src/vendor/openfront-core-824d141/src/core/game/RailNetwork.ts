// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 824d1412be580da8a1309010d00f984483ad2c31.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/824d1412be580da8a1309010d00f984483ad2c31/src/core/game/RailNetwork.ts
// Unmodified copy - see src/vendor/openfront-core-824d141/README.md.
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
