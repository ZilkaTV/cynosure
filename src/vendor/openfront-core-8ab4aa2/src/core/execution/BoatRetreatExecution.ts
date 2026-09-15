// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 8ab4aa2f57859a596acc0daeb5b26524c564e997.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/8ab4aa2f57859a596acc0daeb5b26524c564e997/src/core/execution/BoatRetreatExecution.ts
// Unmodified copy - see src/vendor/openfront-core-8ab4aa2/README.md.
import { Execution, Game, Player, UnitType } from "../game/Game";

export class BoatRetreatExecution implements Execution {
  private active = true;
  constructor(
    private player: Player,
    private unitID: number,
  ) {}

  init(mg: Game, ticks: number): void {}

  tick(ticks: number): void {
    const unit = this.player
      .units()
      .find(
        (unit) =>
          unit.id() === this.unitID && unit.type() === UnitType.TransportShip,
      );

    if (!unit) {
      console.warn(`Didn't find outgoing boat with id ${this.unitID}`);
      this.active = false;
      return;
    }

    unit.updateTransportShipState({ isRetreating: true });
    this.active = false;
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
