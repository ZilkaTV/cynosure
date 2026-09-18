// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 82e5fce9502b99516b5b4b8f06fc0b88823a0cbc.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/82e5fce9502b99516b5b4b8f06fc0b88823a0cbc/src/core/game/GameMapLoader.ts
// Unmodified copy - see src/vendor/openfront-core-82e5fce/README.md.
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
