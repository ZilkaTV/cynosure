// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 90513c0bffeb8e74a83e76c7a99e3b136f433f87.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/90513c0bffeb8e74a83e76c7a99e3b136f433f87/src/core/game/GameMapLoader.ts
// Unmodified copy - see src/vendor/openfront-core-90513c0/README.md.
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
