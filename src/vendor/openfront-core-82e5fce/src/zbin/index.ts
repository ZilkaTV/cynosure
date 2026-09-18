// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 82e5fce9502b99516b5b4b8f06fc0b88823a0cbc.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/82e5fce9502b99516b5b4b8f06fc0b88823a0cbc/zbin/index.ts
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
