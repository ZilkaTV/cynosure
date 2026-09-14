// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit a33efb780c4daf7cfb703bb3e8c7ce5d3f014325.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/a33efb780c4daf7cfb703bb3e8c7ce5d3f014325/src/core/execution/PauseExecution.ts
// Unmodified copy - see src/vendor/openfront-core-a33efb7/README.md.
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
