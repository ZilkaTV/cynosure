// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 0211f17b71efa762242b620b91ffa5d8439522e6.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/0211f17b71efa762242b620b91ffa5d8439522e6/packages/zbin/src/index.ts
// Unmodified copy - see src/vendor/openfront-core-0211f17/README.md.
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
