// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 3fa1a8e0f1996c9efe786a62b5ff97a4d87779cd.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/3fa1a8e0f1996c9efe786a62b5ff97a4d87779cd/src/core/execution/MarkDisconnectedExecution.ts
// Unmodified copy - see src/vendor/openfront-core-3fa1a8e/README.md.
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
