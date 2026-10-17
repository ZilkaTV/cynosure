// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit ab5cc6115080f19b4e65b43fbfd396aaf6150e4f.
// Source: https://github.com/openfrontio/OpenFrontIO/blob/ab5cc6115080f19b4e65b43fbfd396aaf6150e4f/packages/engine/src/game/HumanStats.ts
// Modified for this vendor build (scripts/vendor-engine-packages.mjs): workspace package imports (@openfront/*, resources/*) rewritten to relative paths.
import {
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
  const disconnectedAt: Record<ClientID, number> = {};
  for (const player of game.allPlayers()) {
    const clientID = player.clientID();
    if (player.type() !== PlayerType.Human || clientID === null) continue;
    if (!player.isDisconnected()) continue;
    const tick = player.disconnectedAtTick();
    if (tick !== null) disconnectedAt[clientID] = tick;
  }
  return {
    tick: game.ticks(),
    // A copy: the live object keeps changing as the game runs.
    stats: deepCopy(game.stats().stats()),
    disconnectedAt,
  };
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
