// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 4e837520e886b255b1b020e9c89639dbb9d54038.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/4e837520e886b255b1b020e9c89639dbb9d54038/src/core/execution/PauseExecution.ts
// Unmodified copy - see src/vendor/openfront-core-4e83752/README.md.
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
