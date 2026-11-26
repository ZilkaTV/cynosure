// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 5004a6420d1ba5743291c56ed688b42b5f9e8e10.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/5004a6420d1ba5743291c56ed688b42b5f9e8e10/packages/zbin/src/index.ts
// Unmodified copy - see src/vendor/openfront-core-5004a64/README.md.
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
