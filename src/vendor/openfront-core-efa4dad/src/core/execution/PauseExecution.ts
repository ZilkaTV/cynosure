// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit efa4dadeb6f66fd37be68202fc4dc1d58740ce5e.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/efa4dadeb6f66fd37be68202fc4dc1d58740ce5e/src/core/execution/PauseExecution.ts
// Unmodified copy - see src/vendor/openfront-core-efa4dad/README.md.
import { Execution, Game, GameType, Player } from "../game/Game";

export class PauseExecution implements Execution {
  constructor(
    private player: Player,
    private paused: boolean,
  ) {}

  isActive(): boolean {
    return false;
  }

  activeDuringSpawnPhase(): boolean {
    return true;
  }

  init(game: Game, ticks: number): void {
    if (
      this.player.isLobbyCreator() ||
      game.config().gameConfig().gameType === GameType.Singleplayer
    ) {
      game.setPaused(this.paused);
    }
  }

  tick(ticks: number): void {}
}
