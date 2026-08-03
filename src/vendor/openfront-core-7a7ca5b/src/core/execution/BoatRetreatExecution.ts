// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 7a7ca5be8ff8af4403595e4766b2669ab8124407.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/7a7ca5be8ff8af4403595e4766b2669ab8124407/src/core/execution/BoatRetreatExecution.ts
// Unmodified copy - see src/vendor/openfront-core-7a7ca5b/README.md.
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
