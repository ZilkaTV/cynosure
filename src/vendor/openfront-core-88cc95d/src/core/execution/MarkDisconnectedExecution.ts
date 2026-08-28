// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 88cc95d8b6d74d951546da341be809bfb3cab960.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/88cc95d8b6d74d951546da341be809bfb3cab960/src/core/execution/MarkDisconnectedExecution.ts
// Unmodified copy - see src/vendor/openfront-core-88cc95d/README.md.
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
