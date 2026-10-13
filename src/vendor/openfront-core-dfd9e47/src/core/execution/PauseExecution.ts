// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit dfd9e478b64d92fa25f95597b8cb81d8adee004d.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/dfd9e478b64d92fa25f95597b8cb81d8adee004d/src/core/execution/PauseExecution.ts
// Unmodified copy - see src/vendor/openfront-core-dfd9e47/README.md.
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
