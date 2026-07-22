// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit b22f422728f35127e5596c4b58ce193a100cc5ba.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/b22f422728f35127e5596c4b58ce193a100cc5ba/src/core/execution/PauseExecution.ts
// Unmodified copy - see src/vendor/openfront-core-b22f422/README.md.
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
