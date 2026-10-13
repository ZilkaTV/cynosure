// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit dfd9e478b64d92fa25f95597b8cb81d8adee004d.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/dfd9e478b64d92fa25f95597b8cb81d8adee004d/src/core/execution/SpawnTimerExecution.ts
// Unmodified copy - see src/vendor/openfront-core-dfd9e47/README.md.
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
