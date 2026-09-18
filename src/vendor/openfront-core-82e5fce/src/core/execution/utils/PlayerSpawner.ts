// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 82e5fce9502b99516b5b4b8f06fc0b88823a0cbc.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/82e5fce9502b99516b5b4b8f06fc0b88823a0cbc/src/core/execution/utils/PlayerSpawner.ts
// Unmodified copy - see src/vendor/openfront-core-82e5fce/README.md.
import { Game, PlayerType } from "../../game/Game";
import { GameID } from "../../Schemas";
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
