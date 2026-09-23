// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 59da4bc1bfaacaad02d782b988fd3e228037aff7.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/59da4bc1bfaacaad02d782b988fd3e228037aff7/src/core/execution/SpawnTimerExecution.ts
// Unmodified copy - see src/vendor/openfront-core-59da4bc/README.md.
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
