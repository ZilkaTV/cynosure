// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 90513c0bffeb8e74a83e76c7a99e3b136f433f87.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/90513c0bffeb8e74a83e76c7a99e3b136f433f87/src/core/execution/MarkDisconnectedExecution.ts
// Unmodified copy - see src/vendor/openfront-core-90513c0/README.md.
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
