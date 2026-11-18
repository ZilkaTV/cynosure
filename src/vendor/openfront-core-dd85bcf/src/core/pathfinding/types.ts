// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit dd85bcfb8b20e599fae15298bf56db1e92947f61.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/dd85bcfb8b20e599fae15298bf56db1e92947f61/packages/engine/src/pathfinding/types.ts
// Unmodified copy - see src/vendor/openfront-core-dd85bcf/README.md.
/**
 * Core pathfinding types and interfaces.
 * No dependencies - safe to import from anywhere.
 */

export enum PathStatus {
  NEXT = 0,
  COMPLETE = 2,
  NOT_FOUND = 3,
}

export type PathResult<T> =
  | { status: PathStatus.NEXT; node: T }
  | { status: PathStatus.COMPLETE; node: T }
  | { status: PathStatus.NOT_FOUND };

/**
 * PathFinder - core pathfinding interface.
 * Implementations find paths between nodes.
 */
export interface PathFinder<T> {
  findPath(from: T | T[], to: T): T[] | null;
}

/**
 * SteppingPathFinder - PathFinder with stepping support.
 * Used by execution classes that need incremental path traversal.
 */
export interface SteppingPathFinder<T> extends PathFinder<T> {
  next(from: T, to: T, dist?: number): PathResult<T>;
  invalidate(): void;
}
