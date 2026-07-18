// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit fe5d7708e03ac08c1a62c2eb694e58d564f86ab4.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/fe5d7708e03ac08c1a62c2eb694e58d564f86ab4/src/core/execution/SpawnTimerExecution.ts
// Unmodified copy - see src/vendor/openfront-core-fe5d770/README.md.
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
