// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit ad765842bac44be72a8dc91a9e23369f8fa57744.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/ad765842bac44be72a8dc91a9e23369f8fa57744/src/core/game/GameMapLoader.ts
// Unmodified copy - see src/vendor/openfront-core-ad76584/README.md.
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
