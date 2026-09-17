// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 27611ec0b209b1b758b99617a297ee8b37ef7a03.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/27611ec0b209b1b758b99617a297ee8b37ef7a03/src/core/execution/utils/PlayerSpawner.ts
// Unmodified copy - see src/vendor/openfront-core-27611ec/README.md.
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
