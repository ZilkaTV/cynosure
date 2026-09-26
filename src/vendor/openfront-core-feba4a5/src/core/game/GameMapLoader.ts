// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit feba4a51c33475a184d9c42e35cc5e55829ee3ca.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/feba4a51c33475a184d9c42e35cc5e55829ee3ca/src/core/game/GameMapLoader.ts
// Unmodified copy - see src/vendor/openfront-core-feba4a5/README.md.
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
