// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit d53d6c339fefe0291782e1530242a771a44c9e91.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/d53d6c339fefe0291782e1530242a771a44c9e91/src/core/execution/PauseExecution.ts
// Unmodified copy - see src/vendor/openfront-core-d53d6c3/README.md.
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
