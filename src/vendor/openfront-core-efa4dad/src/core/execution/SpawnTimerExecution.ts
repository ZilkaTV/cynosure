// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit efa4dadeb6f66fd37be68202fc4dc1d58740ce5e.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/efa4dadeb6f66fd37be68202fc4dc1d58740ce5e/src/core/execution/SpawnTimerExecution.ts
// Unmodified copy - see src/vendor/openfront-core-efa4dad/README.md.
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
