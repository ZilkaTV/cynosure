// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit a76a11b837e80b6209bc234f9c3b20c5f4c0c738.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/a76a11b837e80b6209bc234f9c3b20c5f4c0c738/src/core/execution/EmbargoAllExecution.ts
// Unmodified copy - see src/vendor/openfront-core-a76a11b/README.md.
import { Execution, Game, Player, PlayerType } from "../game/Game";

export class EmbargoAllExecution implements Execution {
  constructor(
    private readonly player: Player,
    private readonly action: "start" | "stop",
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
}
