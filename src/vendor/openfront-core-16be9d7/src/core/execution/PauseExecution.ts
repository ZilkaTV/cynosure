// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 16be9d7c15d7abc115691def3a0b2aa559664705.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/16be9d7c15d7abc115691def3a0b2aa559664705/src/core/execution/PauseExecution.ts
// Unmodified copy - see src/vendor/openfront-core-16be9d7/README.md.
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
