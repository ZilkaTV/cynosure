// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit b716adb7e2f1396e8b5ae80730ac052e6f5638ce.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/b716adb7e2f1396e8b5ae80730ac052e6f5638ce/src/core/execution/FactoryExecution.ts
// Unmodified copy - see src/vendor/openfront-core-b716adb/README.md.
import { Execution, Game, Unit, UnitType } from "../game/Game";
import { TrainStationExecution } from "./TrainStationExecution";

export class FactoryExecution implements Execution {
  private active: boolean = true;
  private game: Game;
  private stationCreated = false;

  constructor(private factory: Unit) {}

  init(mg: Game, ticks: number): void {
    this.game = mg;
  }

  tick(ticks: number): void {
    if (!this.stationCreated) {
      this.createStation();
      this.stationCreated = true;
    }
    if (!this.factory.isActive()) {
      this.active = false;
      return;
    }
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }

  private createStation(): void {
    const structures = this.game.nearbyUnits(
      this.factory.tile()!,
      this.game.config().trainStationMaxRange(),
      [UnitType.City, UnitType.Port, UnitType.Factory],
    );

    this.game.addExecution(new TrainStationExecution(this.factory, true));
    for (const { unit } of structures) {
      if (!unit.hasTrainStation()) {
        this.game.addExecution(new TrainStationExecution(unit));
      }
    }
  }
}
