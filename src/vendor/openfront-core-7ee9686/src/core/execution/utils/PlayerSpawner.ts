// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 7ee96860c717b1ea36870cdfa6d4bb1e9bccd6de.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/7ee96860c717b1ea36870cdfa6d4bb1e9bccd6de/packages/engine/src/execution/utils/PlayerSpawner.ts
// Modified for this vendor build (scripts/vendor-engine-packages.mjs): workspace package imports (@openfront/*, resources/*) rewritten to relative paths.
import { PlayerType } from "../../game/GameTypes";
import { GameID } from "../../Schemas";
import { Game } from "../../game/Game";
import { SpawnExecution } from "../SpawnExecution";

export class PlayerSpawner {
  private players: SpawnExecution[] = [];

  constructor(
    private gm: Game,
    private gameID: GameID,
  ) {}

  spawnPlayers(): SpawnExecution[] {
    for (const player of this.gm.allPlayers()) {
      if (player.type() !== PlayerType.Human) {
        continue;
      }

      this.players.push(new SpawnExecution(this.gameID, player.info()));
    }

    return this.players;
  }
}
