// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 87f1a5278c8e1409ce0cdcf183d30a6d806364d2.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/87f1a5278c8e1409ce0cdcf183d30a6d806364d2/src/core/execution/EmbargoAllExecution.ts
// Unmodified copy - see src/vendor/openfront-core-87f1a52/README.md.
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
