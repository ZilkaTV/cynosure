// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 59da4bc1bfaacaad02d782b988fd3e228037aff7.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/59da4bc1bfaacaad02d782b988fd3e228037aff7/src/core/execution/utils/PlayerSpawner.ts
// Unmodified copy - see src/vendor/openfront-core-59da4bc/README.md.
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
