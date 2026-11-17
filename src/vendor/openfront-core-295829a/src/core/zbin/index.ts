// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 295829ac34a4e7043af1759be238438783720a4e.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/295829ac34a4e7043af1759be238438783720a4e/packages/zbin/src/index.ts
// Unmodified copy - see src/vendor/openfront-core-295829a/README.md.
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
