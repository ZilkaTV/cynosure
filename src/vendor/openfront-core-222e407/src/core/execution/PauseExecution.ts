// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 222e4078982e6c21c620a69c82de0392c17385bf.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/222e4078982e6c21c620a69c82de0392c17385bf/src/core/execution/PauseExecution.ts
// Unmodified copy - see src/vendor/openfront-core-222e407/README.md.
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
