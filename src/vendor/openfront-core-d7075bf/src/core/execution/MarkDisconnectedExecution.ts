// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit d7075bface21e6835fadb7a0d0025455f8bc358a.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/d7075bface21e6835fadb7a0d0025455f8bc358a/src/core/execution/MarkDisconnectedExecution.ts
// Unmodified copy - see src/vendor/openfront-core-d7075bf/README.md.
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
