// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 7ee96860c717b1ea36870cdfa6d4bb1e9bccd6de.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/7ee96860c717b1ea36870cdfa6d4bb1e9bccd6de/packages/engine/src/execution/SpawnTimerExecution.ts
// Unmodified copy - see src/vendor/openfront-core-7ee9686/README.md.
import { z } from "zod";
import { Execution, Game } from "../game/Game";
import { execSnapshotType } from "../snapshot/ExecutionSnapshot";
import type { ExecRecord, SnapshotReader } from "../snapshot/SnapshotContext";

export class SpawnTimerExecution implements Execution {
  private mg: Game;

  init(mg: Game): void {
    this.mg = mg;
  }

  tick(): void {
    if (this.mg.ticks() > this.mg.config().numSpawnPhaseTurns()) {
      this.mg.endSpawnPhase();
    }
  }

  isActive(): boolean {
    return this.mg.inSpawnPhase();
  }

  activeDuringSpawnPhase(): boolean {
    return true;
  }

  snapshot(): ExecRecord {
    return SpawnTimerExecutionSnapshot.write({
      initialized: this.mg !== undefined,
    });
  }

  restoreSnapshot(s: SpawnTimerState, r: SnapshotReader): void {
    if (s.initialized) this.mg = r.game;
  }
}

const SpawnTimerStateSchema = z.object({ initialized: z.boolean() });
type SpawnTimerState = z.infer<typeof SpawnTimerStateSchema>;

export const SpawnTimerExecutionSnapshot = execSnapshotType({
  name: "SpawnTimer",
  version: 1,
  schema: SpawnTimerStateSchema,
  cls: () => SpawnTimerExecution,
});
