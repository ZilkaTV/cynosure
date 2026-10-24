// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit a2d20f8e5f32573c7a6a7e0b8900dcfeac4357e7.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/a2d20f8e5f32573c7a6a7e0b8900dcfeac4357e7/packages/engine/src/execution/BoatRetreatExecution.ts
// Modified for this vendor build (scripts/vendor-engine-packages.mjs): workspace package imports (@openfront/*, resources/*) rewritten to relative paths.
import { UnitType } from "../game/GameTypes";
import { zInt, zPlayerRef } from "../snapshot/SnapshotType";
import { z } from "zod";
import { Execution, Game, Player } from "../game/Game";
import { execSnapshotType } from "../snapshot/ExecutionSnapshot";
import type {
  ExecRecord,
  SnapshotReader,
  SnapshotWriter,
} from "../snapshot/SnapshotContext";

export class BoatRetreatExecution implements Execution {
  private active = true;
  constructor(
    private player: Player,
    private unitID: number,
  ) {}

  init(mg: Game, ticks: number): void {}

  tick(ticks: number): void {
    const unit = this.player
      .units()
      .find(
        (unit) =>
          unit.id() === this.unitID && unit.type() === UnitType.TransportShip,
      );

    if (!unit) {
      console.warn(`Didn't find outgoing boat with id ${this.unitID}`);
      this.active = false;
      return;
    }

    unit.updateTransportShipState({ isRetreating: true });
    this.active = false;
  }

  owner(): Player {
    return this.player;
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }

  snapshot(w: SnapshotWriter): ExecRecord {
    return BoatRetreatExecutionSnapshot.write({
      active: this.active,
      player: w.player(this.player),
      unitID: this.unitID,
    });
  }

  restoreSnapshot(s: BoatRetreatState, r: SnapshotReader): void {
    this.active = s.active;
    this.player = r.player(s.player);
    this.unitID = s.unitID;
  }
}

const BoatRetreatStateSchema = z.object({
  active: z.boolean(),
  player: zPlayerRef(),
  unitID: zInt(),
});
type BoatRetreatState = z.infer<typeof BoatRetreatStateSchema>;

export const BoatRetreatExecutionSnapshot = execSnapshotType({
  name: "BoatRetreat",
  version: 1,
  schema: BoatRetreatStateSchema,
  cls: () => BoatRetreatExecution,
});
