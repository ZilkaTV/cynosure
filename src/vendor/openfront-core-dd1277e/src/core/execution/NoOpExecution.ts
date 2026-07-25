// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit dd1277e245b532bf0a41ab12618489d0f6749e31.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/dd1277e245b532bf0a41ab12618489d0f6749e31/src/core/execution/NoOpExecution.ts
// Unmodified copy - see src/vendor/openfront-core-dd1277e/README.md.
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
