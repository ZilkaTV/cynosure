// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 0668045fa926eaa6d6995561a8e13fd8126895b6.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/0668045fa926eaa6d6995561a8e13fd8126895b6/src/core/execution/RecomputeRailClusterExecution.ts
// Unmodified copy - see src/vendor/openfront-core-0668045/README.md.
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
