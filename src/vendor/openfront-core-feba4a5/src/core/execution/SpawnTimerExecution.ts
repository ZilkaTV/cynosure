// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit feba4a51c33475a184d9c42e35cc5e55829ee3ca.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/feba4a51c33475a184d9c42e35cc5e55829ee3ca/src/core/execution/SpawnTimerExecution.ts
// Unmodified copy - see src/vendor/openfront-core-feba4a5/README.md.
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
