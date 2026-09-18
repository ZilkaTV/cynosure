// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 82e5fce9502b99516b5b4b8f06fc0b88823a0cbc.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/82e5fce9502b99516b5b4b8f06fc0b88823a0cbc/src/core/execution/RecomputeRailClusterExecution.ts
// Unmodified copy - see src/vendor/openfront-core-82e5fce/README.md.
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
