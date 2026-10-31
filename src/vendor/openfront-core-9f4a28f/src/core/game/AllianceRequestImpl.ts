// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 9f4a28f16fae951df0daf727e5e64b34ce8b77d1.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/9f4a28f16fae951df0daf727e5e64b34ce8b77d1/packages/engine/src/game/AllianceRequestImpl.ts
// Modified for this vendor build (scripts/vendor-engine-packages.mjs): workspace package imports (@openfront/*, resources/*) rewritten to relative paths.
import { Tick } from "./GameTypes";
import {
  AllianceRequestUpdate,
  GameUpdateType,
} from "./GameUpdates";
import {
  snapshotType,
  zInt,
  zPlayerRef,
} from "../snapshot/SnapshotType";
import { z } from "zod";
import type {
  SnapshotReader,
  SnapshotWriter,
} from "../snapshot/SnapshotContext";
import { AllianceRequest, Player } from "./Game";
import { GameImpl } from "./GameImpl";

export class AllianceRequestImpl implements AllianceRequest {
  private status_: "pending" | "accepted" | "rejected" = "pending";

  constructor(
    private requestor_: Player,
    private recipient_: Player,
    private tickCreated: number,
    private game: GameImpl,
  ) {}

  status(): "pending" | "accepted" | "rejected" {
    return this.status_;
  }

  requestor(): Player {
    return this.requestor_;
  }

  recipient(): Player {
    return this.recipient_;
  }

  createdAt(): Tick {
    return this.tickCreated;
  }

  accept(): void {
    this.status_ = "accepted";
    this.game.acceptAllianceRequest(this);
  }
  reject(): void {
    this.status_ = "rejected";
    this.game.rejectAllianceRequest(this);
  }

  toUpdate(): AllianceRequestUpdate {
    return {
      type: GameUpdateType.AllianceRequest,
      requestorID: this.requestor_.smallID(),
      recipientID: this.recipient_.smallID(),
      createdAt: this.tickCreated,
    };
  }

  snapshot(w: SnapshotWriter): AllianceRequestState {
    return {
      requestor: w.player(this.requestor_),
      recipient: w.player(this.recipient_),
      createdAt: this.tickCreated,
      status: this.status_,
    };
  }

  /** Fills a prototype-only shell; see RestorableExecution.restoreSnapshot. */
  restoreSnapshot(s: AllianceRequestState, r: SnapshotReader): void {
    this.game = r.game;
    this.requestor_ = r.player(s.requestor);
    this.recipient_ = r.player(s.recipient);
    this.tickCreated = s.createdAt;
    this.status_ = s.status;
  }
}

export const AllianceRequestSnapshot = snapshotType({
  name: "AllianceRequest",
  version: 1,
  schema: z.object({
    requestor: zPlayerRef(),
    recipient: zPlayerRef(),
    createdAt: zInt(),
    status: z.enum(["pending", "accepted", "rejected"]),
  }),
});
export type AllianceRequestState = z.infer<
  typeof AllianceRequestSnapshot.schema
>;
