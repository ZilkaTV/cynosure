// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit bc3e3334c573c4959ec6a6745df6826d07233b4d.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/bc3e3334c573c4959ec6a6745df6826d07233b4d/packages/zbin/src/index.ts
// Unmodified copy - see src/vendor/openfront-core-bc3e333/README.md.
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
