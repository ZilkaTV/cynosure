// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit bebc953804e5ef2834642a21bb602eb9014a3a12.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/bebc953804e5ef2834642a21bb602eb9014a3a12/src/core/execution/BoatRetreatExecution.ts
// Unmodified copy - see src/vendor/openfront-core-bebc953/README.md.
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
