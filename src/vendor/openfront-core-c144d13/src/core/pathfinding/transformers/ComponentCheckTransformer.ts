// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit c144d134d1503191b4c3fd9a866fc583b9ecea4a.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/c144d134d1503191b4c3fd9a866fc583b9ecea4a/packages/engine/src/pathfinding/transformers/ComponentCheckTransformer.ts
// Unmodified copy - see src/vendor/openfront-core-c144d13/README.md.
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
