// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 09aa423bceb993cae9c7b4dd3643f55e150ba612.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/09aa423bceb993cae9c7b4dd3643f55e150ba612/packages/engine/src/execution/NoOpExecution.ts
// Unmodified copy - see src/vendor/openfront-core-09aa423/README.md.
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
