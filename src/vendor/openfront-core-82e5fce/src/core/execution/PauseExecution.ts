// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 82e5fce9502b99516b5b4b8f06fc0b88823a0cbc.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/82e5fce9502b99516b5b4b8f06fc0b88823a0cbc/src/core/execution/PauseExecution.ts
// Unmodified copy - see src/vendor/openfront-core-82e5fce/README.md.
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
