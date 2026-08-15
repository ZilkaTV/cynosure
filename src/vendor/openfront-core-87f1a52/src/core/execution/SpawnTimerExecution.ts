// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 87f1a5278c8e1409ce0cdcf183d30a6d806364d2.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/87f1a5278c8e1409ce0cdcf183d30a6d806364d2/src/core/execution/SpawnTimerExecution.ts
// Unmodified copy - see src/vendor/openfront-core-87f1a52/README.md.
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
