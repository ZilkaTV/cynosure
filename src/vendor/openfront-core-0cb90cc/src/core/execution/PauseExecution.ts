// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 0cb90ccb74787e8384f030517423826fe9f607a9.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/0cb90ccb74787e8384f030517423826fe9f607a9/src/core/execution/PauseExecution.ts
// Unmodified copy - see src/vendor/openfront-core-0cb90cc/README.md.
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
