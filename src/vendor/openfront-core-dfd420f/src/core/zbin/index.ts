// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit dfd420fd7836ae023504a9440d9d68897745b7b4.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/dfd420fd7836ae023504a9440d9d68897745b7b4/packages/zbin/src/index.ts
// Unmodified copy - see src/vendor/openfront-core-dfd420f/README.md.
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
