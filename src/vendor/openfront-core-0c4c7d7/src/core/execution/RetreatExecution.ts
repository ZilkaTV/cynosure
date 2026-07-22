// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 0c4c7d7993c91bd058af2790c5b9f7b48fa8e90b.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/0c4c7d7993c91bd058af2790c5b9f7b48fa8e90b/src/core/execution/RetreatExecution.ts
// Unmodified copy - see src/vendor/openfront-core-0c4c7d7/README.md.
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
