// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit feba4a51c33475a184d9c42e35cc5e55829ee3ca.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/feba4a51c33475a184d9c42e35cc5e55829ee3ca/src/core/execution/utils/PlayerSpawner.ts
// Unmodified copy - see src/vendor/openfront-core-feba4a5/README.md.
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
