// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit ad765842bac44be72a8dc91a9e23369f8fa57744.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/ad765842bac44be72a8dc91a9e23369f8fa57744/src/core/execution/NoOpExecution.ts
// Unmodified copy - see src/vendor/openfront-core-ad76584/README.md.
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
