// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit e9e10703e8188f2a34defdeda9598778a934094a.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/e9e10703e8188f2a34defdeda9598778a934094a/src/core/execution/NoOpExecution.ts
// Unmodified copy - see src/vendor/openfront-core-e9e1070/README.md.
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
