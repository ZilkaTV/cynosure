// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit fe5d7708e03ac08c1a62c2eb694e58d564f86ab4.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/fe5d7708e03ac08c1a62c2eb694e58d564f86ab4/src/core/execution/MarkDisconnectedExecution.ts
// Unmodified copy - see src/vendor/openfront-core-fe5d770/README.md.
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
