// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit dfd9e478b64d92fa25f95597b8cb81d8adee004d.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/dfd9e478b64d92fa25f95597b8cb81d8adee004d/src/core/pathfinding/PathFinderBuilder.ts
// Unmodified copy - see src/vendor/openfront-core-dfd9e47/README.md.
import { DebugSpan } from "../utilities/DebugSpan";
import { PathFinderStepper, StepperConfig } from "./PathFinderStepper";
import { PathFinder, SteppingPathFinder } from "./types";

type WrapFactory<T> = (pf: PathFinder<T>) => PathFinder<T>;

/**
 * PathFinderBuilder - fluent builder for composing PathFinder transformers.
 *
 * Usage:
 *   const finder = PathFinderBuilder.create(corePathFinder)
 *     .wrap((pf) => new SomeTransformer(pf, deps))
 *     .wrap((pf) => new AnotherTransformer(pf, deps))
 *     .build();
 */
export class PathFinderBuilder<T> {
  private wrappers: WrapFactory<T>[] = [];

  private constructor(private core: PathFinder<T>) {}

  static create<T>(core: PathFinder<T>): PathFinderBuilder<T> {
    return new PathFinderBuilder(core);
  }

  wrap(factory: WrapFactory<T>): this {
    this.wrappers.push(factory);
    return this;
  }

  build(): PathFinder<T> {
    const pathFinder = this.wrappers.reduce(
      (pf, wrapper) => wrapper(pf),
      this.core as PathFinder<T>,
    );

    const _findPath = pathFinder.findPath;
    pathFinder.findPath = function (from: T | T[], to: T): T[] | null {
      return DebugSpan.wrap("findPath", () => _findPath.call(this, from, to));
    };

    return pathFinder;
  }

  /**
   * Build and wrap with PathFinderStepper for step-by-step traversal.
   */
  buildWithStepper(config: StepperConfig<T>): SteppingPathFinder<T> {
    return new PathFinderStepper(this.build(), config);
  }
}
