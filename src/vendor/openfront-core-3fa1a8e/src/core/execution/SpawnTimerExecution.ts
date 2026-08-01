// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 3fa1a8e0f1996c9efe786a62b5ff97a4d87779cd.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/3fa1a8e0f1996c9efe786a62b5ff97a4d87779cd/src/core/execution/SpawnTimerExecution.ts
// Unmodified copy - see src/vendor/openfront-core-3fa1a8e/README.md.
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
