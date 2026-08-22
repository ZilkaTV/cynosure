// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 3229956f09a0307c7ed1d31e07aed9a9f9356cbd.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/3229956f09a0307c7ed1d31e07aed9a9f9356cbd/src/core/execution/SpawnTimerExecution.ts
// Unmodified copy - see src/vendor/openfront-core-3229956/README.md.
import { Execution, Game } from "../game/Game";

export class SpawnTimerExecution implements Execution {
  private mg: Game;

  init(mg: Game): void {
    this.mg = mg;
  }

  tick(): void {
    if (this.mg.ticks() > this.mg.config().numSpawnPhaseTurns()) {
      this.mg.endSpawnPhase();
    }
  }

  isActive(): boolean {
    return this.mg.inSpawnPhase();
  }

  activeDuringSpawnPhase(): boolean {
    return true;
  }
}
