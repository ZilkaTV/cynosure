// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 4e837520e886b255b1b020e9c89639dbb9d54038.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/4e837520e886b255b1b020e9c89639dbb9d54038/src/core/execution/SpawnTimerExecution.ts
// Unmodified copy - see src/vendor/openfront-core-4e83752/README.md.
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
