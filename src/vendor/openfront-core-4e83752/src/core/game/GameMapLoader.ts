// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 4e837520e886b255b1b020e9c89639dbb9d54038.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/4e837520e886b255b1b020e9c89639dbb9d54038/src/core/game/GameMapLoader.ts
// Unmodified copy - see src/vendor/openfront-core-4e83752/README.md.
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
