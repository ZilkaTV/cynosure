// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 8ab4aa2f57859a596acc0daeb5b26524c564e997.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/8ab4aa2f57859a596acc0daeb5b26524c564e997/src/core/execution/utils/PlayerSpawner.ts
// Unmodified copy - see src/vendor/openfront-core-8ab4aa2/README.md.
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
