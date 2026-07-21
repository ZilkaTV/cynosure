// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit f0da41820727cfccc27320d7eb97fbd188488e47.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/f0da41820727cfccc27320d7eb97fbd188488e47/src/core/execution/RecomputeRailClusterExecution.ts
// Unmodified copy - see src/vendor/openfront-core-f0da418/README.md.
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
