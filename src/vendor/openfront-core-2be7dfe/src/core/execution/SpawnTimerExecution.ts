// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 2be7dfe239ea26d01f566910fb6f50b059c89e8a.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/2be7dfe239ea26d01f566910fb6f50b059c89e8a/src/core/execution/SpawnTimerExecution.ts
// Unmodified copy - see src/vendor/openfront-core-2be7dfe/README.md.
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
