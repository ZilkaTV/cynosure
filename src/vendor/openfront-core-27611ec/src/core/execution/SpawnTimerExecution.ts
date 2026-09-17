// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 27611ec0b209b1b758b99617a297ee8b37ef7a03.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/27611ec0b209b1b758b99617a297ee8b37ef7a03/src/core/execution/SpawnTimerExecution.ts
// Unmodified copy - see src/vendor/openfront-core-27611ec/README.md.
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
