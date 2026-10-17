// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 08b63c054897c030e6516e0731ab7cc62b2998b7.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/08b63c054897c030e6516e0731ab7cc62b2998b7/packages/engine/src/execution/NoOpExecution.ts
// Unmodified copy - see src/vendor/openfront-core-08b63c0/README.md.
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
