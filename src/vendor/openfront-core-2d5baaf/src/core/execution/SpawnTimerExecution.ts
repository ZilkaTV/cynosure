// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 2d5baafdd0cc3f38ee1805d07ef15c1bc5bce09b.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/2d5baafdd0cc3f38ee1805d07ef15c1bc5bce09b/src/core/execution/SpawnTimerExecution.ts
// Unmodified copy - see src/vendor/openfront-core-2d5baaf/README.md.
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
