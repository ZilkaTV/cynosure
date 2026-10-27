// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit bf0ac8a1163f151ffc3c1ccbada3f0de18a4c3b0.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/bf0ac8a1163f151ffc3c1ccbada3f0de18a4c3b0/packages/zbin/src/index.ts
// Unmodified copy - see src/vendor/openfront-core-bf0ac8a/README.md.
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
