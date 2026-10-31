// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit bf0ac8a1163f151ffc3c1ccbada3f0de18a4c3b0.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/bf0ac8a1163f151ffc3c1ccbada3f0de18a4c3b0/packages/engine/src/game/RailNetwork.ts
// Modified for this vendor build (scripts/vendor-engine-packages.mjs): workspace package imports (@openfront/*, resources/*) rewritten to relative paths.
import { TileRef } from "./GameMap";
import { UnitType } from "./GameTypes";
import { Unit } from "./Game";
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
