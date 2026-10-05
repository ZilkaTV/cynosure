// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 71154c52c2a236ab04b08d9b2041f9ea8252a58c.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/71154c52c2a236ab04b08d9b2041f9ea8252a58c/src/core/game/GameMapLoader.ts
// Unmodified copy - see src/vendor/openfront-core-71154c5/README.md.
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
