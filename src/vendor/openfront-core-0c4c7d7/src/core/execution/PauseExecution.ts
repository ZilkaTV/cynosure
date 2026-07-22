// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 0c4c7d7993c91bd058af2790c5b9f7b48fa8e90b.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/0c4c7d7993c91bd058af2790c5b9f7b48fa8e90b/src/core/execution/PauseExecution.ts
// Unmodified copy - see src/vendor/openfront-core-0c4c7d7/README.md.
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
