// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit cfa6c47a1a58cdc5f9a779980c2896d92dcb8f8c.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/cfa6c47a1a58cdc5f9a779980c2896d92dcb8f8c/src/core/execution/MissileSiloExecution.ts
// Unmodified copy - see src/vendor/openfront-core-cfa6c47/README.md.
import { Execution, Game, Unit } from "../game/Game";

export class MissileSiloExecution implements Execution {
  private active = true;
  private mg: Game;
  private silo: Unit;

  constructor(silo: Unit) {
    this.silo = silo;
  }

  init(mg: Game, ticks: number): void {
    this.mg = mg;
  }

  tick(ticks: number): void {
    if (this.silo.isUnderConstruction()) {
      return;
    }

    if (!this.silo.isActive()) {
      this.active = false;
      return;
    }

    // frontTime is the time the earliest missile fired.
    const frontTime = this.silo.missileTimerQueue()[0];
    if (frontTime === undefined) {
      return;
    }

    const cooldown =
      this.mg.config().SiloCooldown() - (this.mg.ticks() - frontTime);

    if (cooldown <= 0) {
      this.silo.reloadMissile();
    }
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }
}
