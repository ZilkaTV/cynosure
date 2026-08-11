// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 20c813f06a403da294760fc6089b222179b6a66b.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/20c813f06a403da294760fc6089b222179b6a66b/src/core/execution/MissileSiloExecution.ts
// Unmodified copy - see src/vendor/openfront-core-20c813f/README.md.
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
