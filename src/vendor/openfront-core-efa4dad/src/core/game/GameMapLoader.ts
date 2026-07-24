// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit efa4dadeb6f66fd37be68202fc4dc1d58740ce5e.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/efa4dadeb6f66fd37be68202fc4dc1d58740ce5e/src/core/game/GameMapLoader.ts
// Unmodified copy - see src/vendor/openfront-core-efa4dad/README.md.
import { GameMapType } from "./Game";
import { MapManifest } from "./TerrainMapLoader";

export interface GameMapLoader {
  getMapData(map: GameMapType): MapData;
}

export interface MapData {
  mapBin: () => Promise<Uint8Array>;
  map4xBin: () => Promise<Uint8Array>;
  map16xBin: () => Promise<Uint8Array>;
  manifest: () => Promise<MapManifest>;
  webpPath: string;
}
