// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 14ba82badb1e945ef2e758999238339404fdb788.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/14ba82badb1e945ef2e758999238339404fdb788/packages/zbin/src/index.ts
// Unmodified copy - see src/vendor/openfront-core-14ba82b/README.md.
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
