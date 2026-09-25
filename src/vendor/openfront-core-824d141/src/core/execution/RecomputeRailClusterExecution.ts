// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 824d1412be580da8a1309010d00f984483ad2c31.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/824d1412be580da8a1309010d00f984483ad2c31/src/core/execution/RecomputeRailClusterExecution.ts
// Unmodified copy - see src/vendor/openfront-core-824d141/README.md.
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
