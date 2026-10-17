// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 538d205f1279d5037e28fb933e631c612550f5ff.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/538d205f1279d5037e28fb933e631c612550f5ff/packages/engine/src/execution/NoOpExecution.ts
// Unmodified copy - see src/vendor/openfront-core-538d205/README.md.
import { z } from "zod";
import { Execution, Game } from "../game/Game";
import { execSnapshotType } from "../snapshot/ExecutionSnapshot";
import type { ExecRecord } from "../snapshot/SnapshotContext";

export class NoOpExecution implements Execution {
  isActive(): boolean {
    return false;
  }
  activeDuringSpawnPhase(): boolean {
    return false;
  }
  init(mg: Game, ticks: number): void {}
  tick(ticks: number): void {}

  snapshot(): ExecRecord {
    return NoOpExecutionSnapshot.write({});
  }

  restoreSnapshot(): void {}
}

export const NoOpExecutionSnapshot = execSnapshotType({
  name: "NoOp",
  version: 1,
  schema: z.object({}),
  cls: () => NoOpExecution,
});
