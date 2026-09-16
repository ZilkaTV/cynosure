// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 129cfcb1c3e7986de1a8007a024905bbadb36526.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/129cfcb1c3e7986de1a8007a024905bbadb36526/src/core/execution/SpawnTimerExecution.ts
// Unmodified copy - see src/vendor/openfront-core-129cfcb/README.md.
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
