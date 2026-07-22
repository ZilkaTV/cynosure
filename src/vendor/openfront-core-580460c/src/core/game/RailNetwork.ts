// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 580460c9692aea2bdc1dce97eba1bbee378e270d.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/580460c9692aea2bdc1dce97eba1bbee378e270d/src/core/game/RailNetwork.ts
// Unmodified copy - see src/vendor/openfront-core-580460c/README.md.
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
