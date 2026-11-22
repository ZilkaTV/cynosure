// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 7f10dda6629bbcfbd782948ba39acce8efca84f1.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/7f10dda6629bbcfbd782948ba39acce8efca84f1/packages/zbin/src/index.ts
// Unmodified copy - see src/vendor/openfront-core-7f10dda/README.md.
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
