// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 1e973bb534b8b37d8d30c80ab27ad1391a7b82da.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/1e973bb534b8b37d8d30c80ab27ad1391a7b82da/src/core/execution/RecomputeRailClusterExecution.ts
// Unmodified copy - see src/vendor/openfront-core-1e973bb/README.md.
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
