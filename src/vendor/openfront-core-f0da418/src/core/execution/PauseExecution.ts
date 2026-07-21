// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit f0da41820727cfccc27320d7eb97fbd188488e47.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/f0da41820727cfccc27320d7eb97fbd188488e47/src/core/execution/PauseExecution.ts
// Unmodified copy - see src/vendor/openfront-core-f0da418/README.md.
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
