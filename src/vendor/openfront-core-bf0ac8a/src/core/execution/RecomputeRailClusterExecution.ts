// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit bf0ac8a1163f151ffc3c1ccbada3f0de18a4c3b0.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/bf0ac8a1163f151ffc3c1ccbada3f0de18a4c3b0/packages/engine/src/execution/RecomputeRailClusterExecution.ts
// Unmodified copy - see src/vendor/openfront-core-bf0ac8a/README.md.
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
