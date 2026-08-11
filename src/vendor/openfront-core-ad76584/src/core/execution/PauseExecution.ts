// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit ad765842bac44be72a8dc91a9e23369f8fa57744.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/ad765842bac44be72a8dc91a9e23369f8fa57744/src/core/execution/PauseExecution.ts
// Unmodified copy - see src/vendor/openfront-core-ad76584/README.md.
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
