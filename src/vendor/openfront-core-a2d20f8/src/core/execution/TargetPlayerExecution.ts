// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit a2d20f8e5f32573c7a6a7e0b8900dcfeac4357e7.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/a2d20f8e5f32573c7a6a7e0b8900dcfeac4357e7/packages/engine/src/execution/TargetPlayerExecution.ts
// Modified for this vendor build (scripts/vendor-engine-packages.mjs): workspace package imports (@openfront/*, resources/*) rewritten to relative paths.
import { PlayerID } from "../game/GameTypes";
import { zPlayerRef } from "../snapshot/SnapshotType";
import { z } from "zod";
import { Execution, Game, Player } from "../game/Game";
import { execSnapshotType } from "../snapshot/ExecutionSnapshot";
import type {
  ExecRecord,
  SnapshotReader,
  SnapshotWriter,
} from "../snapshot/SnapshotContext";

export class TargetPlayerExecution implements Execution {
  private target: Player;

  private active = true;

  constructor(
    private requestor: Player,
    private targetID: PlayerID,
  ) {}

  init(mg: Game, ticks: number): void {
    if (!mg.hasPlayer(this.targetID)) {
      console.warn(`TargetPlayerExecution: target ${this.targetID} not found`);
      this.active = false;
      return;
    }

    this.target = mg.player(this.targetID);
  }

  tick(ticks: number): void {
    if (this.requestor.canTarget(this.target)) {
      this.requestor.target(this.target);
      this.target.updateRelation(this.requestor, -40);
    }
    this.active = false;
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }

  snapshot(w: SnapshotWriter): ExecRecord {
    return TargetPlayerExecutionSnapshot.write({
      active: this.active,
      target: this.target === undefined ? null : w.player(this.target),
      requestor: w.player(this.requestor),
      targetID: this.targetID,
    });
  }

  restoreSnapshot(s: TargetPlayerState, r: SnapshotReader): void {
    this.active = s.active;
    if (s.target !== null) this.target = r.player(s.target);
    this.requestor = r.player(s.requestor);
    this.targetID = s.targetID;
  }
}

const TargetPlayerStateSchema = z.object({
  active: z.boolean(),
  target: zPlayerRef().nullable(),
  requestor: zPlayerRef(),
  targetID: z.string(),
});
type TargetPlayerState = z.infer<typeof TargetPlayerStateSchema>;

export const TargetPlayerExecutionSnapshot = execSnapshotType({
  name: "TargetPlayer",
  version: 1,
  schema: TargetPlayerStateSchema,
  cls: () => TargetPlayerExecution,
});
