// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 577819ba0e1e13ecdbc8dede2ba33de542c88a67.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/577819ba0e1e13ecdbc8dede2ba33de542c88a67/src/core/execution/MarkDisconnectedExecution.ts
// Unmodified copy - see src/vendor/openfront-core-577819b/README.md.
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
