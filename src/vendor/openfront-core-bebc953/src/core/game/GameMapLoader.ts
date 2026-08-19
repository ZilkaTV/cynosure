// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit bebc953804e5ef2834642a21bb602eb9014a3a12.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/bebc953804e5ef2834642a21bb602eb9014a3a12/src/core/game/GameMapLoader.ts
// Unmodified copy - see src/vendor/openfront-core-bebc953/README.md.
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
