// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 0cb90ccb74787e8384f030517423826fe9f607a9.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/0cb90ccb74787e8384f030517423826fe9f607a9/src/core/execution/RecomputeRailClusterExecution.ts
// Unmodified copy - see src/vendor/openfront-core-0cb90cc/README.md.
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
