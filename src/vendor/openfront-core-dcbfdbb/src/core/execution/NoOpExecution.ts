// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit dcbfdbbdc91431a8442fb9e9cccd35f832acc82f.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/dcbfdbbdc91431a8442fb9e9cccd35f832acc82f/src/core/execution/NoOpExecution.ts
// Unmodified copy - see src/vendor/openfront-core-dcbfdbb/README.md.
import { Execution, Game } from "../game/Game";

export class NoOpExecution implements Execution {
  isActive(): boolean {
    return false;
  }
  activeDuringSpawnPhase(): boolean {
    return false;
  }
  init(mg: Game, ticks: number): void {}
  tick(ticks: number): void {}
}
