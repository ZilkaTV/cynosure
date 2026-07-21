// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit f0da41820727cfccc27320d7eb97fbd188488e47.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/f0da41820727cfccc27320d7eb97fbd188488e47/src/core/game/AllianceRequestImpl.ts
// Unmodified copy - see src/vendor/openfront-core-f0da418/README.md.
import { AllianceRequest, Player, Tick } from "./Game";
import { GameImpl } from "./GameImpl";
import { AllianceRequestUpdate, GameUpdateType } from "./GameUpdates";

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
}
