// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit dcbfdbbdc91431a8442fb9e9cccd35f832acc82f.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/dcbfdbbdc91431a8442fb9e9cccd35f832acc82f/src/core/execution/UpgradeStructureExecution.ts
// Unmodified copy - see src/vendor/openfront-core-dcbfdbb/README.md.
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
