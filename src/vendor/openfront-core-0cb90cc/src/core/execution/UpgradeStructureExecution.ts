// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 0cb90ccb74787e8384f030517423826fe9f607a9.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/0cb90ccb74787e8384f030517423826fe9f607a9/src/core/execution/UpgradeStructureExecution.ts
// Unmodified copy - see src/vendor/openfront-core-0cb90cc/README.md.
import { Execution, Game, Player, Unit } from "../game/Game";

export class UpgradeStructureExecution implements Execution {
  private structure: Unit | undefined;
  private cost: bigint;

  constructor(
    private player: Player,
    private unitId: number,
    private amount: number = 1,
  ) {}

  init(mg: Game, ticks: number): void {
    this.structure = mg.unit(this.unitId);
    if (this.structure && this.structure.owner() !== this.player) {
      console.warn(`structure not owned by player`);
      this.structure = undefined;
    }

    if (this.structure === undefined) {
      console.warn(`structure is undefined`);
      return;
    }

    for (let i = 0; i < this.amount; i++) {
      if (!this.player.canUpgradeUnit(this.structure)) {
        if (i === 0) {
          console.warn(
            `[UpgradeStructureExecution] unit type ${this.structure.type()} cannot be upgraded`,
          );
        }
        break;
      }
      this.player.upgradeUnit(this.structure);
    }
    return;
  }

  tick(ticks: number): void {
    return;
  }

  isActive(): boolean {
    return false;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }
}
