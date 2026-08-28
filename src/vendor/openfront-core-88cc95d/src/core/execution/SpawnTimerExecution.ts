// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 88cc95d8b6d74d951546da341be809bfb3cab960.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/88cc95d8b6d74d951546da341be809bfb3cab960/src/core/execution/SpawnTimerExecution.ts
// Unmodified copy - see src/vendor/openfront-core-88cc95d/README.md.
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
