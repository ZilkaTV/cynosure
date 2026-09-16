// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 129cfcb1c3e7986de1a8007a024905bbadb36526.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/129cfcb1c3e7986de1a8007a024905bbadb36526/src/core/execution/NoOpExecution.ts
// Unmodified copy - see src/vendor/openfront-core-129cfcb/README.md.
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
