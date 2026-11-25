// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit a9780cf68b5ef7210b1917bcda138054e9986add.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/a9780cf68b5ef7210b1917bcda138054e9986add/packages/zbin/src/index.ts
// Unmodified copy - see src/vendor/openfront-core-a9780cf/README.md.
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
