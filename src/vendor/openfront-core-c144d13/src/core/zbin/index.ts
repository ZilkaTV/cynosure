// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit c144d134d1503191b4c3fd9a866fc583b9ecea4a.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/c144d134d1503191b4c3fd9a866fc583b9ecea4a/packages/zbin/src/index.ts
// Unmodified copy - see src/vendor/openfront-core-c144d13/README.md.
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
