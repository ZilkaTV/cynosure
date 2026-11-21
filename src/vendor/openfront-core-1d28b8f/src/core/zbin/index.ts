// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 1d28b8f2595f8cb60e6a554318b16d583212036d.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/1d28b8f2595f8cb60e6a554318b16d583212036d/packages/zbin/src/index.ts
// Unmodified copy - see src/vendor/openfront-core-1d28b8f/README.md.
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
