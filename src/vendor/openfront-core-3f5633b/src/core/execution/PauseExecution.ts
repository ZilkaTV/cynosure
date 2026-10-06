// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 3f5633b92c9508461e6e2b9e1f926487a1804c9f.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/3f5633b92c9508461e6e2b9e1f926487a1804c9f/src/core/execution/PauseExecution.ts
// Unmodified copy - see src/vendor/openfront-core-3f5633b/README.md.
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
