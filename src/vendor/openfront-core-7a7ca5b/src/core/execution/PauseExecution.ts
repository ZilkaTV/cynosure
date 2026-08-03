// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 7a7ca5be8ff8af4403595e4766b2669ab8124407.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/7a7ca5be8ff8af4403595e4766b2669ab8124407/src/core/execution/PauseExecution.ts
// Unmodified copy - see src/vendor/openfront-core-7a7ca5b/README.md.
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
