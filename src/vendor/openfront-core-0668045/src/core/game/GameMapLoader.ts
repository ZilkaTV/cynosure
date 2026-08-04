// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 0668045fa926eaa6d6995561a8e13fd8126895b6.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/0668045fa926eaa6d6995561a8e13fd8126895b6/src/core/game/GameMapLoader.ts
// Unmodified copy - see src/vendor/openfront-core-0668045/README.md.
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
