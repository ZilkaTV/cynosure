// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit dcbfdbbdc91431a8442fb9e9cccd35f832acc82f.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/dcbfdbbdc91431a8442fb9e9cccd35f832acc82f/src/core/game/GameMapLoader.ts
// Unmodified copy - see src/vendor/openfront-core-dcbfdbb/README.md.
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
