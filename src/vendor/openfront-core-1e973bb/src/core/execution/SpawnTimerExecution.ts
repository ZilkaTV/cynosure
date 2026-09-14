// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 1e973bb534b8b37d8d30c80ab27ad1391a7b82da.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/1e973bb534b8b37d8d30c80ab27ad1391a7b82da/src/core/execution/SpawnTimerExecution.ts
// Unmodified copy - see src/vendor/openfront-core-1e973bb/README.md.
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
