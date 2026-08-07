// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit e9e10703e8188f2a34defdeda9598778a934094a.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/e9e10703e8188f2a34defdeda9598778a934094a/src/core/execution/MarkDisconnectedExecution.ts
// Unmodified copy - see src/vendor/openfront-core-e9e1070/README.md.
import { Execution, Game, Player } from "../game/Game";

export class MarkDisconnectedExecution implements Execution {
  constructor(
    private player: Player,
    private isDisconnected: boolean,
  ) {}

  init(mg: Game, ticks: number): void {
    this.player.markDisconnected(this.isDisconnected);
  }

  tick(ticks: number): void {
    return;
  }

  isActive(): boolean {
    return false;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }
}
