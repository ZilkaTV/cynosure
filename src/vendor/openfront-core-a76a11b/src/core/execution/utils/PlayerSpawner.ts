// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit a76a11b837e80b6209bc234f9c3b20c5f4c0c738.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/a76a11b837e80b6209bc234f9c3b20c5f4c0c738/src/core/execution/utils/PlayerSpawner.ts
// Unmodified copy - see src/vendor/openfront-core-a76a11b/README.md.
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
