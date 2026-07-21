// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit f0da41820727cfccc27320d7eb97fbd188488e47.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/f0da41820727cfccc27320d7eb97fbd188488e47/src/core/execution/NoOpExecution.ts
// Unmodified copy - see src/vendor/openfront-core-f0da418/README.md.
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
