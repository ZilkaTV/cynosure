// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit feba4a51c33475a184d9c42e35cc5e55829ee3ca.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/feba4a51c33475a184d9c42e35cc5e55829ee3ca/src/core/execution/NoOpExecution.ts
// Unmodified copy - see src/vendor/openfront-core-feba4a5/README.md.
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
