// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit ece79bfd33483c139469faa0553154e3a229e069.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/ece79bfd33483c139469faa0553154e3a229e069/src/core/execution/RecomputeRailClusterExecution.ts
// Unmodified copy - see src/vendor/openfront-core-ece79bf/README.md.
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
