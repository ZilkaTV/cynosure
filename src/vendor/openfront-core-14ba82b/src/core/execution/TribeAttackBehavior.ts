// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 14ba82badb1e945ef2e758999238339404fdb788.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/14ba82badb1e945ef2e758999238339404fdb788/packages/engine/src/execution/TribeAttackBehavior.ts
// Modified for this vendor build (scripts/vendor-engine-packages.mjs): workspace package imports (@openfront/*, resources/*) rewritten to relative paths.
import { PlayerType } from "../game/GameTypes";
import { PseudoRandom } from "../PseudoRandom";
import { Versioned } from "../snapshot/SnapshotType";
import { Player } from "../game/Game";
import type {
  SnapshotReader,
  SnapshotWriter,
} from "../snapshot/SnapshotContext";
import { AiAttackBehavior } from "./utils/AiAttackBehavior";

export class TribeAttackBehavior extends AiAttackBehavior {
  snapshot(w: SnapshotWriter): Versioned {
    return this.writeRecord(w, 0, []);
  }

  /** Fills a prototype-only shell; only assigns (see README). */
  restoreSnapshot(
    raw: unknown,
    r: SnapshotReader,
    random: PseudoRandom,
    player: Player,
  ): void {
    this.restoreRecord(raw, r, random, player);
  }

  attackRandomTarget() {
    // Save up troops until we reach the trigger ratio
    if (!this.hasTriggerRatioTroops()) return;

    // Retaliate against incoming attacks
    const incomingAttackPlayer = this.findIncomingAttackPlayer();
    if (incomingAttackPlayer) {
      if (this.sendAttack(incomingAttackPlayer, true)) return;
    }

    // Select a traitor as an enemy
    const toAttack = this.getNeighborTraitorToAttack();
    if (toAttack !== null) {
      if (this.random.chance(3)) {
        if (this.sendAttack(toAttack)) return;
      }
    }

    // Choose a new enemy randomly
    const neighbors = this.player.nearby();
    for (const neighbor of this.random.shuffleArray(neighbors)) {
      if (!neighbor.isPlayer()) continue;
      if (this.player.isFriendly(neighbor)) continue;
      if (
        neighbor.type() === PlayerType.Nation ||
        neighbor.type() === PlayerType.Human
      ) {
        if (this.random.chance(2)) {
          continue;
        }
      }
      if (this.sendAttack(neighbor)) return;
    }
  }

  // Allies only for a caller that breaks the alliance before attacking
  getNeighborTraitorToAttack(includeAllies = false): Player | null {
    if (this.game.config().disableAlliances()) return null;

    const traitors = this.player
      .nearby()
      .filter(
        (n): n is Player =>
          n.isPlayer() &&
          (includeAllies || !this.player.isFriendly(n)) &&
          n.isTraitor(),
      );
    return traitors.length > 0 ? this.random.randElement(traitors) : null;
  }
}
