// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit fb07e61a9161b3b8e0991c6dc0e0ef6406f653e3.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/fb07e61a9161b3b8e0991c6dc0e0ef6406f653e3/src/core/execution/utils/PlayerSpawner.ts
// Unmodified copy - see src/vendor/openfront-core-fb07e61/README.md.
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
