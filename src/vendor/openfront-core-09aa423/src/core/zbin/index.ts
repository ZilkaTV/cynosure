// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 09aa423bceb993cae9c7b4dd3643f55e150ba612.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/09aa423bceb993cae9c7b4dd3643f55e150ba612/packages/zbin/src/index.ts
// Unmodified copy - see src/vendor/openfront-core-09aa423/README.md.
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
