// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 20c813f06a403da294760fc6089b222179b6a66b.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/20c813f06a403da294760fc6089b222179b6a66b/src/core/execution/EmbargoExecution.ts
// Unmodified copy - see src/vendor/openfront-core-20c813f/README.md.
import { Execution, Game, Player, PlayerID } from "../game/Game";

export class EmbargoExecution implements Execution {
  private active = true;

  private target: Player;

  constructor(
    private player: Player,
    private targetID: PlayerID,
    private readonly action: "start" | "stop",
  ) {}

  init(mg: Game, _: number): void {
    if (!mg.hasPlayer(this.targetID)) {
      console.warn(`EmbargoExecution recipient ${this.targetID} not found`);
      this.active = false;
      return;
    }
    this.target = mg.player(this.targetID);
  }

  tick(_: number): void {
    if (this.action === "start") this.player.addEmbargo(this.target, false);
    else this.player.stopEmbargo(this.target);

    this.active = false;
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }
}
