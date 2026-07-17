// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 16be9d7c15d7abc115691def3a0b2aa559664705.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/16be9d7c15d7abc115691def3a0b2aa559664705/src/core/execution/alliance/AllianceRejectExecution.ts
// Unmodified copy - see src/vendor/openfront-core-16be9d7/README.md.
import { Execution, Game, Player, PlayerID } from "../../game/Game";

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
}
