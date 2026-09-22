// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit cfa6c47a1a58cdc5f9a779980c2896d92dcb8f8c.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/cfa6c47a1a58cdc5f9a779980c2896d92dcb8f8c/src/core/execution/utils/PlayerSpawner.ts
// Unmodified copy - see src/vendor/openfront-core-cfa6c47/README.md.
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
