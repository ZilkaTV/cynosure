// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 580460c9692aea2bdc1dce97eba1bbee378e270d.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/580460c9692aea2bdc1dce97eba1bbee378e270d/src/core/game/TransportShipUtils.ts
// Unmodified copy - see src/vendor/openfront-core-580460c/README.md.
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

  const dst = targetTransportTile(game, tile);
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

export function targetTransportTile(gm: Game, tile: TileRef): TileRef | null {
  const spatial = new SpatialQuery(gm);
  return spatial.closestShore(gm.owner(tile), tile);
}

export function bestShoreDeploymentSource(
  gm: Game,
  player: Player,
  dst: TileRef,
): TileRef | null {
  const spatial = new SpatialQuery(gm);
  return spatial.closestShoreByWater(player, dst);
}
