// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit cfa6c47a1a58cdc5f9a779980c2896d92dcb8f8c.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/cfa6c47a1a58cdc5f9a779980c2896d92dcb8f8c/src/core/execution/MarkDisconnectedExecution.ts
// Unmodified copy - see src/vendor/openfront-core-cfa6c47/README.md.
import { Execution, Game, Player } from "../game/Game";

export class MarkDisconnectedExecution implements Execution {
  constructor(
    private player: Player,
    private isDisconnected: boolean,
  ) {}

  init(mg: Game, ticks: number): void {
    if (this.isDisconnected) {
      const team = this.player.team();
      const teamTiles = team ? mg.teamTilesOwned(team) : 0;
      const totalLand = mg.totalLandTiles();
      this.player.markDisconnected(true, {
        currentTick: ticks,
        teamTiles,
        totalLand,
        wasAlive: this.player.isAlive(),
      });
    } else {
      this.player.markDisconnected(false);
    }
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
