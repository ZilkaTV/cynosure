// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit dd1277e245b532bf0a41ab12618489d0f6749e31.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/dd1277e245b532bf0a41ab12618489d0f6749e31/src/core/execution/MarkDisconnectedExecution.ts
// Unmodified copy - see src/vendor/openfront-core-dd1277e/README.md.
import { Execution, Game, Player } from "../game/Game";

export class MarkDisconnectedExecution implements Execution {
  constructor(
    private player: Player,
    private isDisconnected: boolean,
  ) {}

  init(mg: Game, ticks: number): void {
    this.player.markDisconnected(this.isDisconnected);
  }

  tick(ticks: number): void {
    return;
  }

  isActive(): boolean {
    return false;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }
}
