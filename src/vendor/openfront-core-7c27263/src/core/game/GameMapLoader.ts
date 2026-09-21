// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 7c27263390d8f1976566e5c5ad9adf6fcad311b6.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/7c27263390d8f1976566e5c5ad9adf6fcad311b6/src/core/game/GameMapLoader.ts
// Unmodified copy - see src/vendor/openfront-core-7c27263/README.md.
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
  /** Load a map layer PNG by layer id. Returns an ImageBitmap. */
  layerPng: (layerId: string) => Promise<ImageBitmap>;
}
