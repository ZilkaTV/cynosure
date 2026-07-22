// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit b716adb7e2f1396e8b5ae80730ac052e6f5638ce.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/b716adb7e2f1396e8b5ae80730ac052e6f5638ce/src/core/pathfinding/transformers/ComponentCheckTransformer.ts
// Unmodified copy - see src/vendor/openfront-core-b716adb/README.md.
// Component check transformer - fail fast if src/dst in different components

import { PathFinder } from "../types";

/**
 * Wraps a PathFinder to fail fast when source and destination
 * are in different components (e.g., disconnected water bodies).
 *
 * Avoids running expensive pathfinding when no path exists.
 */
export class ComponentCheckTransformer<T> implements PathFinder<T> {
  constructor(
    private inner: PathFinder<T>,
    private getComponent: (t: T) => number,
  ) {}

  findPath(from: T | T[], to: T): T[] | null {
    const toComponent = this.getComponent(to);

    // Check all sources - at least one must match destination component
    const fromArray = Array.isArray(from) ? from : [from];
    const validSources = fromArray.filter(
      (f) => this.getComponent(f) === toComponent,
    );

    if (validSources.length === 0) {
      return null; // No source in same component as destination
    }

    // Delegate with only valid sources
    const delegateFrom =
      validSources.length === 1 ? validSources[0] : validSources;
    return this.inner.findPath(delegateFrom, to);
  }
}
