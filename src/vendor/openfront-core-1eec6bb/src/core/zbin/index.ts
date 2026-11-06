// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 1eec6bbceeecc01d98046c5c381758a23b46483e.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/1eec6bbceeecc01d98046c5c381758a23b46483e/packages/zbin/src/index.ts
// Unmodified copy - see src/vendor/openfront-core-1eec6bb/README.md.
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
