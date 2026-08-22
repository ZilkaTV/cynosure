// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 2d5baafdd0cc3f38ee1805d07ef15c1bc5bce09b.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/2d5baafdd0cc3f38ee1805d07ef15c1bc5bce09b/src/core/execution/UpgradeStructureExecution.ts
// Unmodified copy - see src/vendor/openfront-core-2d5baaf/README.md.
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
