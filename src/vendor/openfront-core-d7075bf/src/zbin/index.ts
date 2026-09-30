// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit d7075bface21e6835fadb7a0d0025455f8bc358a.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/d7075bface21e6835fadb7a0d0025455f8bc358a/zbin/index.ts
// Unmodified copy - lives outside src/ upstream too (a top-level sibling module,
// nested one level into this vendor tree instead - see this tree's README.md).
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
