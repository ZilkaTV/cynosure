// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 3229956f09a0307c7ed1d31e07aed9a9f9356cbd.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/3229956f09a0307c7ed1d31e07aed9a9f9356cbd/src/core/execution/EmbargoAllExecution.ts
// Unmodified copy - see src/vendor/openfront-core-3229956/README.md.
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
