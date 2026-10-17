// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit ab5cc6115080f19b4e65b43fbfd396aaf6150e4f.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/ab5cc6115080f19b4e65b43fbfd396aaf6150e4f/packages/engine/src/execution/EmbargoAllExecution.ts
// Modified for this vendor build (scripts/vendor-engine-packages.mjs): workspace package imports (@openfront/*, resources/*) rewritten to relative paths.
import { PlayerType } from "../game/GameTypes";
import { zPlayerRef } from "../snapshot/SnapshotType";
import { z } from "zod";
import { Execution, Game, Player } from "../game/Game";
import { execSnapshotType } from "../snapshot/ExecutionSnapshot";
import type {
  ExecRecord,
  SnapshotReader,
  SnapshotWriter,
} from "../snapshot/SnapshotContext";

export class EmbargoAllExecution implements Execution {
  constructor(
    private player: Player,
    private action: "start" | "stop",
  ) {}

  init(mg: Game, _: number): void {
    if (!this.player.canEmbargoAll()) {
      return;
    }
    const me = this.player;
    for (const p of mg.players()) {
      if (p.id() === me.id()) continue;
      if (p.type() === PlayerType.Bot) continue;
      if (me.isOnSameTeam(p)) continue;

      if (this.action === "start") {
        if (!me.hasEmbargoAgainst(p)) me.addEmbargo(p, false);
      } else {
        if (me.hasEmbargoAgainst(p)) me.stopEmbargo(p);
      }
    }

    this.player.recordEmbargoAll();
  }

  tick(_: number): void {}

  isActive(): boolean {
    return false;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }

  snapshot(w: SnapshotWriter): ExecRecord {
    return EmbargoAllExecutionSnapshot.write({
      player: w.player(this.player),
      action: this.action,
    });
  }

  restoreSnapshot(s: EmbargoAllState, r: SnapshotReader): void {
    this.player = r.player(s.player);
    this.action = s.action;
  }
}

const EmbargoAllStateSchema = z.object({
  player: zPlayerRef(),
  action: z.enum(["start", "stop"]),
});
type EmbargoAllState = z.infer<typeof EmbargoAllStateSchema>;

export const EmbargoAllExecutionSnapshot = execSnapshotType({
  name: "EmbargoAll",
  version: 1,
  schema: EmbargoAllStateSchema,
  cls: () => EmbargoAllExecution,
});
