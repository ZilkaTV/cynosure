// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 7d1c2edfb68e6d4ce6575eea0270f87832a17eda.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/7d1c2edfb68e6d4ce6575eea0270f87832a17eda/src/core/game/GameMapLoader.ts
// Unmodified copy - see src/vendor/openfront-core-7d1c2ed/README.md.
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
