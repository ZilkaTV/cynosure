// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 53e1a5b03e35c27a3130c1c534f9416b8d6c724f.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/53e1a5b03e35c27a3130c1c534f9416b8d6c724f/src/core/game/GameMapLoader.ts
// Unmodified copy - see src/vendor/openfront-core-53e1a5b/README.md.
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
