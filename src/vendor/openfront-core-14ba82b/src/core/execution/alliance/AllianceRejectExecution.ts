// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 14ba82badb1e945ef2e758999238339404fdb788.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/14ba82badb1e945ef2e758999238339404fdb788/packages/engine/src/execution/alliance/AllianceRejectExecution.ts
// Modified for this vendor build (scripts/vendor-engine-packages.mjs): workspace package imports (@openfront/*, resources/*) rewritten to relative paths.
import { PlayerID } from "../../game/GameTypes";
import { zPlayerRef } from "../../snapshot/SnapshotType";
import { z } from "zod";
import { Execution, Game, Player } from "../../game/Game";
import { execSnapshotType } from "../../snapshot/ExecutionSnapshot";
import type {
  ExecRecord,
  SnapshotReader,
  SnapshotWriter,
} from "../../snapshot/SnapshotContext";

export class AllianceRejectExecution implements Execution {
  private active = true;

  constructor(
    private requestorID: PlayerID,
    private recipient: Player,
  ) {}

  init(mg: Game, ticks: number): void {
    if (!mg.hasPlayer(this.requestorID)) {
      console.warn(
        `[AllianceRejectExecution] Requestor ${this.requestorID} not found`,
      );
      this.active = false;
      return;
    }
    const requestor = mg.player(this.requestorID);

    if (requestor.isFriendly(this.recipient)) {
      console.warn(
        `[AllianceRejectExecution] Player ${this.requestorID} cannot reject alliance with ${this.recipient.id}, already allied`,
      );
    } else {
      const request = requestor
        .outgoingAllianceRequests()
        .find((ar) => ar.recipient() === this.recipient);
      if (request === undefined) {
        console.warn(
          `[AllianceRejectExecution] Player ${this.requestorID} cannot reject alliance with ${this.recipient.id}, no alliance request found`,
        );
      } else {
        request.reject();
      }
    }
    this.active = false;
  }

  tick(ticks: number): void {}

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }

  snapshot(w: SnapshotWriter): ExecRecord {
    return AllianceRejectExecutionSnapshot.write({
      active: this.active,
      requestorID: this.requestorID,
      recipient: w.player(this.recipient),
    });
  }

  restoreSnapshot(s: AllianceRejectState, r: SnapshotReader): void {
    this.active = s.active;
    this.requestorID = s.requestorID;
    this.recipient = r.player(s.recipient);
  }
}

const AllianceRejectStateSchema = z.object({
  active: z.boolean(),
  requestorID: z.string(),
  recipient: zPlayerRef(),
});
type AllianceRejectState = z.infer<typeof AllianceRejectStateSchema>;

export const AllianceRejectExecutionSnapshot = execSnapshotType({
  name: "AllianceReject",
  version: 1,
  schema: AllianceRejectStateSchema,
  cls: () => AllianceRejectExecution,
});
