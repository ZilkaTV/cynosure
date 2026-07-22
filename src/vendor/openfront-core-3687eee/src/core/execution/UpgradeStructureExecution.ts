// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 3687eee03bec116b7d19f470bffdd62648180372.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/3687eee03bec116b7d19f470bffdd62648180372/src/core/execution/UpgradeStructureExecution.ts
// Unmodified copy - see src/vendor/openfront-core-3687eee/README.md.
import { Execution, Game, Player, Unit } from "../game/Game";

export class UpgradeStructureExecution implements Execution {
  private structure: Unit | undefined;
  private cost: bigint;

  constructor(
    private player: Player,
    private unitId: number,
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

    if (!this.player.canUpgradeUnit(this.structure)) {
      console.warn(
        `[UpgradeStructureExecution] unit type ${this.structure.type()} cannot be upgraded`,
      );
      return;
    }
    this.player.upgradeUnit(this.structure);
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
