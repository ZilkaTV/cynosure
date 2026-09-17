// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit fb07e61a9161b3b8e0991c6dc0e0ef6406f653e3.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/fb07e61a9161b3b8e0991c6dc0e0ef6406f653e3/src/core/execution/SpawnTimerExecution.ts
// Unmodified copy - see src/vendor/openfront-core-fb07e61/README.md.
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
