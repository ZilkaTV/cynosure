// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 0cb90ccb74787e8384f030517423826fe9f607a9.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/0cb90ccb74787e8384f030517423826fe9f607a9/src/core/execution/MarkDisconnectedExecution.ts
// Unmodified copy - see src/vendor/openfront-core-0cb90cc/README.md.
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
