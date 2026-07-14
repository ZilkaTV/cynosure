// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit aeb8d60224e3eb72fdbae0fdf91ebb8a9affe77d.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/aeb8d60224e3eb72fdbae0fdf91ebb8a9affe77d/src/core/execution/TargetPlayerExecution.ts
// Unmodified copy - see src/vendor/openfront-core/README.md.
import { Execution, Game, Player, PlayerID } from "../game/Game";

export class TargetPlayerExecution implements Execution {
  private target: Player;

  private active = true;

  constructor(
    private requestor: Player,
    private targetID: PlayerID,
  ) {}

  init(mg: Game, ticks: number): void {
    if (!mg.hasPlayer(this.targetID)) {
      console.warn(`TargetPlayerExecution: target ${this.targetID} not found`);
      this.active = false;
      return;
    }

    this.target = mg.player(this.targetID);
  }

  tick(ticks: number): void {
    if (this.requestor.canTarget(this.target)) {
      this.requestor.target(this.target);
      this.target.updateRelation(this.requestor, -40);
    }
    this.active = false;
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }
}
