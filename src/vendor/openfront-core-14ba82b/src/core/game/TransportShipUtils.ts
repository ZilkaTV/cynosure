// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 14ba82badb1e945ef2e758999238339404fdb788.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/14ba82badb1e945ef2e758999238339404fdb788/packages/engine/src/game/TransportShipUtils.ts
// Modified for this vendor build (scripts/vendor-engine-packages.mjs): workspace package imports (@openfront/*, resources/*) rewritten to relative paths.
import { TileRef } from "./GameMap";
import { UnitType } from "./GameTypes";
import { SpatialQuery } from "../pathfinding/spatial/SpatialQuery";
import { Game, Player } from "./Game";

export function canBuildTransportShip(
  game: Game,
  player: Player,
  tile: TileRef,
): TileRef | false {
  if (
    player.unitCount(UnitType.TransportShip) >= game.config().boatMaxNumber()
  ) {
    return false;
  }

  const dst = targetTransportTile(game, player, tile);
  if (dst === null) {
    return false;
  }

  const other = game.owner(tile);
  if (other === player) {
    return false;
  }
  if (other.isPlayer() && !player.canAttackPlayer(other)) {
    return false;
  }

  const spatial = new SpatialQuery(game);
  return spatial.closestShoreByWater(player, dst) ?? false;
}

export function targetTransportTile(
  gm: Game,
  attacker: Player,
  tile: TileRef,
): TileRef | null {
  const spatial = new SpatialQuery(gm);
  // Only consider landing shores the attacker can actually reach by water, so a
  // shore facing a disconnected inland lake is never chosen as the target.
  return spatial.closestReachableShore(gm.owner(tile), attacker, tile);
}

export function bestShoreDeploymentSource(
  gm: Game,
  player: Player,
  dst: TileRef,
): TileRef | null {
  const spatial = new SpatialQuery(gm);
  return spatial.closestShoreByWater(player, dst);
}
