// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit aeb8d60224e3eb72fdbae0fdf91ebb8a9affe77d.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/aeb8d60224e3eb72fdbae0fdf91ebb8a9affe77d/src/core/game/GameMapLoader.ts
// Unmodified copy - see src/vendor/openfront-core/README.md.
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
