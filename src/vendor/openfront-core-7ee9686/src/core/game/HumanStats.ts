// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit 7ee96860c717b1ea36870cdfa6d4bb1e9bccd6de.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/7ee96860c717b1ea36870cdfa6d4bb1e9bccd6de/packages/engine/src/game/HumanStats.ts
// Modified for this vendor build (scripts/vendor-engine-packages.mjs): workspace package imports (@openfront/*, resources/*) rewritten to relative paths.
import {
  HumanDisconnects,
  HumanStatsSnapshot,
  PlayerType,
} from "./GameTypes";
import { ClientID } from "../Schemas";
import { Game } from "./Game";

/**
 * The humans' stats as they stand right now (see HumanStatsSnapshot in
 * engine-api's GameTypes). Read-only: nothing here touches the simulation.
 */
export function humanStatsSnapshot(game: Game): HumanStatsSnapshot {
  return {
    ...humanDisconnects(game),
    // A copy: the live object keeps changing as the game runs.
    stats: deepCopy(game.stats().stats()),
  };
}

/**
 * The tick and the humans whose connection is lost right now, without the
 * stats (see HumanDisconnects in engine-api's GameTypes): nothing is copied
 * but the disconnects. Read-only, like humanStatsSnapshot.
 */
export function humanDisconnects(game: Game): HumanDisconnects {
  const disconnectedAt: Record<ClientID, number> = {};
  for (const player of game.allPlayers()) {
    const clientID = player.clientID();
    if (player.type() !== PlayerType.Human || clientID === null) continue;
    if (!player.isDisconnected()) continue;
    const tick = player.disconnectedAtTick();
    if (tick !== null) disconnectedAt[clientID] = tick;
  }
  return { tick: game.ticks(), disconnectedAt };
}

// The stats are plain objects and arrays of numbers, bigints and strings.
// structuredClone is a host API the engine may not use.
function deepCopy<T>(value: T): T {
  if (Array.isArray(value)) return value.map(deepCopy) as T;
  if (value !== null && typeof value === "object") {
    const copy: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) copy[key] = deepCopy(v);
    return copy as T;
  }
  return value;
}
