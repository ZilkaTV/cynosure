// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit dd1277e245b532bf0a41ab12618489d0f6749e31.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/dd1277e245b532bf0a41ab12618489d0f6749e31/src/core/game/GameMapLoader.ts
// Unmodified copy - see src/vendor/openfront-core-dd1277e/README.md.
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
