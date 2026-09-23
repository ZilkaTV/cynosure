// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 59da4bc1bfaacaad02d782b988fd3e228037aff7.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/59da4bc1bfaacaad02d782b988fd3e228037aff7/src/core/execution/RecomputeRailClusterExecution.ts
// Unmodified copy - see src/vendor/openfront-core-59da4bc/README.md.
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
