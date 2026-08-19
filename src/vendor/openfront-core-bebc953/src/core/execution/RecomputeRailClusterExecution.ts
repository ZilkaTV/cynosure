// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit bebc953804e5ef2834642a21bb602eb9014a3a12.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/bebc953804e5ef2834642a21bb602eb9014a3a12/src/core/execution/RecomputeRailClusterExecution.ts
// Unmodified copy - see src/vendor/openfront-core-bebc953/README.md.
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
