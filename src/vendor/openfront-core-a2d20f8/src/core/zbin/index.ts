// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit a2d20f8e5f32573c7a6a7e0b8900dcfeac4357e7.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/a2d20f8e5f32573c7a6a7e0b8900dcfeac4357e7/packages/zbin/src/index.ts
// Unmodified copy - see src/vendor/openfront-core-a2d20f8/README.md.
export {
  ByteReader,
  ByteWriter,
  MAX_BIGINT_BITS,
  MAX_DECODE_DEPTH,
  MAX_DECODE_ITEMS,
  ZbDecodeError,
  ZbEncodeError,
} from "./bytes";
export { MAX_MAPPING_SIZE, ZbContext } from "./context";
export type { ZbTable } from "./context";
export * as zb from "./zb";
export type { Codec, ZbMethods, ZbSchema } from "./zb";
