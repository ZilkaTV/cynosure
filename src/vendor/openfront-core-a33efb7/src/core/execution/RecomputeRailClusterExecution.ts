// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit a33efb780c4daf7cfb703bb3e8c7ce5d3f014325.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/a33efb780c4daf7cfb703bb3e8c7ce5d3f014325/src/core/execution/RecomputeRailClusterExecution.ts
// Unmodified copy - see src/vendor/openfront-core-a33efb7/README.md.
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
