// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 8ab4aa2f57859a596acc0daeb5b26524c564e997.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/8ab4aa2f57859a596acc0daeb5b26524c564e997/src/core/execution/SpawnTimerExecution.ts
// Unmodified copy - see src/vendor/openfront-core-8ab4aa2/README.md.
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
