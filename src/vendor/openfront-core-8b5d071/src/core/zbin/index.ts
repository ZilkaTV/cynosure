// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 8b5d071eed95f07c701b32e4c64e95b03f8577c1.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/8b5d071eed95f07c701b32e4c64e95b03f8577c1/packages/zbin/src/index.ts
// Unmodified copy - see src/vendor/openfront-core-8b5d071/README.md.
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
