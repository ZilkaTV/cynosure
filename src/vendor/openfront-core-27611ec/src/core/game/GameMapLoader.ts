// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 27611ec0b209b1b758b99617a297ee8b37ef7a03.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/27611ec0b209b1b758b99617a297ee8b37ef7a03/src/core/game/GameMapLoader.ts
// Unmodified copy - see src/vendor/openfront-core-27611ec/README.md.
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
