// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 4e837520e886b255b1b020e9c89639dbb9d54038.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/4e837520e886b255b1b020e9c89639dbb9d54038/src/core/execution/RecomputeRailClusterExecution.ts
// Unmodified copy - see src/vendor/openfront-core-4e83752/README.md.
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
