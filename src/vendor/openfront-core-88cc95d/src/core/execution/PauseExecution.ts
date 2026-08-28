// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 88cc95d8b6d74d951546da341be809bfb3cab960.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/88cc95d8b6d74d951546da341be809bfb3cab960/src/core/execution/PauseExecution.ts
// Unmodified copy - see src/vendor/openfront-core-88cc95d/README.md.
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
