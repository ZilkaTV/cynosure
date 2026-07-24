// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 7d1c2edfb68e6d4ce6575eea0270f87832a17eda.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/7d1c2edfb68e6d4ce6575eea0270f87832a17eda/src/core/execution/alliance/BreakAllianceExecution.ts
// Unmodified copy - see src/vendor/openfront-core-7d1c2ed/README.md.
import { Execution, Game, Player, PlayerID } from "../../game/Game";

export class BreakAllianceExecution implements Execution {
  private active = true;
  private recipient: Player | null = null;
  private mg: Game | null = null;

  constructor(
    private requestor: Player,
    private recipientID: PlayerID,
  ) {}

  init(mg: Game, ticks: number): void {
    if (!mg.hasPlayer(this.recipientID)) {
      console.warn(
        `BreakAllianceExecution: recipient ${this.recipientID} not found`,
      );
      this.active = false;
      return;
    }
    this.recipient = mg.player(this.recipientID);
    this.mg = mg;
  }

  tick(ticks: number): void {
    if (
      this.mg === null ||
      this.requestor === null ||
      this.recipient === null
    ) {
      throw new Error("Not initialized");
    }
    const alliance = this.requestor.allianceWith(this.recipient);
    if (alliance === null) {
      console.warn("cant break alliance, not allied");
    } else {
      this.requestor.breakAlliance(alliance);
      this.recipient.updateRelation(this.requestor, -100);

      const neighbors = this.requestor
        .nearby()
        .filter(
          (n): n is Player => n.isPlayer() && !n.isOnSameTeam(this.recipient!),
        );

      for (const neighbor of neighbors) {
        neighbor.updateRelation(this.requestor, -40);
      }
    }
    this.active = false;
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }
}
