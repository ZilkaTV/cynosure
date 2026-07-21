// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit f0da41820727cfccc27320d7eb97fbd188488e47.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/f0da41820727cfccc27320d7eb97fbd188488e47/src/core/execution/BoatRetreatExecution.ts
// Unmodified copy - see src/vendor/openfront-core-f0da418/README.md.
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
