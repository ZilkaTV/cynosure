// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 20c813f06a403da294760fc6089b222179b6a66b.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/20c813f06a403da294760fc6089b222179b6a66b/src/core/execution/NoOpExecution.ts
// Unmodified copy - see src/vendor/openfront-core-20c813f/README.md.
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
