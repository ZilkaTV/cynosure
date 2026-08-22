// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit d53d6c339fefe0291782e1530242a771a44c9e91.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/d53d6c339fefe0291782e1530242a771a44c9e91/src/core/execution/EmbargoAllExecution.ts
// Unmodified copy - see src/vendor/openfront-core-d53d6c3/README.md.
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
