// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit efa4dadeb6f66fd37be68202fc4dc1d58740ce5e.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/efa4dadeb6f66fd37be68202fc4dc1d58740ce5e/src/core/execution/RecomputeRailClusterExecution.ts
// Unmodified copy - see src/vendor/openfront-core-efa4dad/README.md.
import { Execution, Game } from "../game/Game";
import { RailNetwork } from "../game/RailNetwork";

export class RecomputeRailClusterExecution implements Execution {
  constructor(private railNetwork: RailNetwork) {}

  isActive(): boolean {
    return true;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }

  init(mg: Game, ticks: number): void {}

  tick(ticks: number): void {
    this.railNetwork.recomputeClusters();
  }
}
