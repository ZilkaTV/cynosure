// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 7ee96860c717b1ea36870cdfa6d4bb1e9bccd6de.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/7ee96860c717b1ea36870cdfa6d4bb1e9bccd6de/packages/engine/src/execution/nation/TutorialCollapse.ts
// Modified for this vendor build (scripts/vendor-engine-packages.mjs): workspace package imports (@openfront/*, resources/*) rewritten to relative paths.
import { PlayerType } from "../../game/GameTypes";
import { Game, Player } from "../../game/Game";

/**
 * A tutorial nation the player is attacking falls once it's down to this
 * many tiles: the kingdom peaks at about 1,400 and the empire at about 900,
 * and chasing the last scraps of their land teaches nothing.
 */
export const TUTORIAL_COLLAPSE_TILES = 250;

/**
 * The onboarding tutorial's nations fall before they lose all their land
 * (docs/OnboardingTutorial.md): once the player is attacking one and it's
 * down to TUTORIAL_COLLAPSE_TILES, the player conquers the rest of it.
 * Stateless, like TutorialSilo.
 */
export function tutorialCollapse(game: Game, nation: Player): void {
  if (nation.numTilesOwned() >= TUTORIAL_COLLAPSE_TILES) return;
  const human = game.players().find((p) => p.type() === PlayerType.Human);
  if (human === undefined) return;
  if (!nation.incomingAttacks().some((a) => a.attacker() === human)) return;
  game.conquerPlayer(human, nation);
  for (const tile of [...nation.tiles()]) human.conquer(tile);
}
