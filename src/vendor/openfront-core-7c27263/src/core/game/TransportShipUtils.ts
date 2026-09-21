// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 7c27263390d8f1976566e5c5ad9adf6fcad311b6.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/7c27263390d8f1976566e5c5ad9adf6fcad311b6/src/core/game/TransportShipUtils.ts
// Unmodified copy - see src/vendor/openfront-core-7c27263/README.md.
import { SpatialQuery } from "../pathfinding/spatial/SpatialQuery";
import { Game, Player, UnitType } from "./Game";
import { TileRef } from "./GameMap";

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
