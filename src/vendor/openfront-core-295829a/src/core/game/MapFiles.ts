// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 295829ac34a4e7043af1759be238438783720a4e.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/295829ac34a4e7043af1759be238438783720a4e/packages/engine-api/src/game/MapFiles.ts
// Unmodified copy - see src/vendor/openfront-core-295829a/README.md.
import { GameMapSize, GameMapType } from "./GameTypes";
import type { MapManifest } from "./MapManifest";

/**
 * The files one map needs at one size, already loaded: the engine gets
 * these in its init message and never fetches. Normal games use map.bin
 * and map4x.bin, compact ones map4x.bin and map16x.bin.
 */
export interface MapFiles {
  map: GameMapType;
  mapSize: GameMapSize;
  manifest: MapManifest;
  mapBin?: Uint8Array;
  map4xBin?: Uint8Array;
  map16xBin?: Uint8Array;
}

export type {
  AdditionalNation,
  LayerPlacement,
  MapLayer,
  MapManifest,
  MapMetadata,
  Nation,
} from "./MapManifest";
