// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit a76a11b837e80b6209bc234f9c3b20c5f4c0c738.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/a76a11b837e80b6209bc234f9c3b20c5f4c0c738/src/core/execution/NoOpExecution.ts
// Unmodified copy - see src/vendor/openfront-core-a76a11b/README.md.
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
