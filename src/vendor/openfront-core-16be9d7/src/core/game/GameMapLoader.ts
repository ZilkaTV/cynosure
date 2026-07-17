// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 16be9d7c15d7abc115691def3a0b2aa559664705.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/16be9d7c15d7abc115691def3a0b2aa559664705/src/core/game/GameMapLoader.ts
// Unmodified copy - see src/vendor/openfront-core-16be9d7/README.md.
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
