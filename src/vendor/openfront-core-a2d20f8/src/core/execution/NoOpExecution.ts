// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit a2d20f8e5f32573c7a6a7e0b8900dcfeac4357e7.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/a2d20f8e5f32573c7a6a7e0b8900dcfeac4357e7/packages/engine/src/execution/NoOpExecution.ts
// Unmodified copy - see src/vendor/openfront-core-a2d20f8/README.md.
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
