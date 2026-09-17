// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit ece79bfd33483c139469faa0553154e3a229e069.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/ece79bfd33483c139469faa0553154e3a229e069/src/core/execution/NoOpExecution.ts
// Unmodified copy - see src/vendor/openfront-core-ece79bf/README.md.
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
