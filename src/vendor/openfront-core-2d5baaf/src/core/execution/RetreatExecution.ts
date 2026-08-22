// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 2d5baafdd0cc3f38ee1805d07ef15c1bc5bce09b.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/2d5baafdd0cc3f38ee1805d07ef15c1bc5bce09b/src/core/execution/RetreatExecution.ts
// Unmodified copy - see src/vendor/openfront-core-2d5baaf/README.md.
import { Execution, Game, Player } from "../game/Game";

const cancelDelay = 20;

export class RetreatExecution implements Execution {
  private active = true;
  private retreatOrdered = false;
  private startTick: number;
  private mg: Game;
  constructor(
    private player: Player,
    private attackID: string,
  ) {}

  init(mg: Game, ticks: number): void {
    this.mg = mg;
    this.startTick = mg.ticks();
  }

  tick(ticks: number): void {
    if (!this.retreatOrdered) {
      this.player.orderRetreat(this.attackID);
      this.retreatOrdered = true;
    }

    if (this.mg.ticks() >= this.startTick + cancelDelay) {
      this.player.executeRetreat(this.attackID);
      this.active = false;
    }
  }

  owner(): Player {
    return this.player;
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }
}
