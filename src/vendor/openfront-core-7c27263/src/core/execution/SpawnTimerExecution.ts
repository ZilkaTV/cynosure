// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 7c27263390d8f1976566e5c5ad9adf6fcad311b6.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/7c27263390d8f1976566e5c5ad9adf6fcad311b6/src/core/execution/SpawnTimerExecution.ts
// Unmodified copy - see src/vendor/openfront-core-7c27263/README.md.
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
