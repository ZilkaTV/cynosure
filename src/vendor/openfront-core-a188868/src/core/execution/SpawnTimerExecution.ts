// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit a188868bc16c25caa2d3b5b5cb4b929663f7b5ad.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/a188868bc16c25caa2d3b5b5cb4b929663f7b5ad/src/core/execution/SpawnTimerExecution.ts
// Unmodified copy - see src/vendor/openfront-core-a188868/README.md.
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
