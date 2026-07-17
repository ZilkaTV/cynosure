// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit aeb8d60224e3eb72fdbae0fdf91ebb8a9affe77d.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/aeb8d60224e3eb72fdbae0fdf91ebb8a9affe77d/src/core/execution/MarkDisconnectedExecution.ts
// Unmodified copy - see src/vendor/openfront-core/README.md.
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
