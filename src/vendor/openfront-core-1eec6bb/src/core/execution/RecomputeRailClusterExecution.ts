// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 1eec6bbceeecc01d98046c5c381758a23b46483e.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/1eec6bbceeecc01d98046c5c381758a23b46483e/packages/engine/src/execution/RecomputeRailClusterExecution.ts
// Unmodified copy - see src/vendor/openfront-core-1eec6bb/README.md.
import { z } from "zod";
import { Execution, Game } from "../game/Game";
import { RailNetwork } from "../game/RailNetwork";
import { execSnapshotType } from "../snapshot/ExecutionSnapshot";
import type { ExecRecord, SnapshotReader } from "../snapshot/SnapshotContext";

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

  snapshot(): ExecRecord {
    return RecomputeRailClusterExecutionSnapshot.write({});
  }

  restoreSnapshot(_s: unknown, r: SnapshotReader): void {
    this.railNetwork = r.game.railNetwork();
  }
}

export const RecomputeRailClusterExecutionSnapshot = execSnapshotType({
  name: "RecomputeRailCluster",
  version: 1,
  schema: z.object({}),
  cls: () => RecomputeRailClusterExecution,
});
