// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit e9e10703e8188f2a34defdeda9598778a934094a.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/e9e10703e8188f2a34defdeda9598778a934094a/src/core/game/GameMapLoader.ts
// Unmodified copy - see src/vendor/openfront-core-e9e1070/README.md.
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
