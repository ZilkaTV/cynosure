// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 27611ec0b209b1b758b99617a297ee8b37ef7a03.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/27611ec0b209b1b758b99617a297ee8b37ef7a03/src/core/execution/PauseExecution.ts
// Unmodified copy - see src/vendor/openfront-core-27611ec/README.md.
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
