// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 0668045fa926eaa6d6995561a8e13fd8126895b6.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/0668045fa926eaa6d6995561a8e13fd8126895b6/src/core/execution/SpawnTimerExecution.ts
// Unmodified copy - see src/vendor/openfront-core-0668045/README.md.
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
