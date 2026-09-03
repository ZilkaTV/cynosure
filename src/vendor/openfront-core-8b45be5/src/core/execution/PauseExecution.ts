// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 8b45be57542f5f8cce8380c4a75d816674a1dabe.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/8b45be57542f5f8cce8380c4a75d816674a1dabe/src/core/execution/PauseExecution.ts
// Unmodified copy - see src/vendor/openfront-core-8b45be5/README.md.
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
