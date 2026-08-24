// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 90513c0bffeb8e74a83e76c7a99e3b136f433f87.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/90513c0bffeb8e74a83e76c7a99e3b136f433f87/src/core/execution/SpawnTimerExecution.ts
// Unmodified copy - see src/vendor/openfront-core-90513c0/README.md.
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
