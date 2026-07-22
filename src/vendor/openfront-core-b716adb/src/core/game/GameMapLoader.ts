// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit b716adb7e2f1396e8b5ae80730ac052e6f5638ce.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/b716adb7e2f1396e8b5ae80730ac052e6f5638ce/src/core/game/GameMapLoader.ts
// Unmodified copy - see src/vendor/openfront-core-b716adb/README.md.
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
}
