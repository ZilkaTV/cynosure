// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit aeb8d60224e3eb72fdbae0fdf91ebb8a9affe77d.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/aeb8d60224e3eb72fdbae0fdf91ebb8a9affe77d/src/core/execution/NoOpExecution.ts
// Unmodified copy - see src/vendor/openfront-core/README.md.
import { Execution, Game } from "../game/Game";

export class NoOpExecution implements Execution {
  isActive(): boolean {
    return false;
  }
  activeDuringSpawnPhase(): boolean {
    return false;
  }
  init(mg: Game, ticks: number): void {}
  tick(ticks: number): void {}
}
