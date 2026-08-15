// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 87f1a5278c8e1409ce0cdcf183d30a6d806364d2.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/87f1a5278c8e1409ce0cdcf183d30a6d806364d2/src/core/game/GameMapLoader.ts
// Unmodified copy - see src/vendor/openfront-core-87f1a52/README.md.
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
