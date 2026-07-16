// ── Replay worker ────────────────────────────────────────────────────────
// Runs the actual tick-by-tick simulation off the main thread entirely, so
// the page never lags no matter how heavy a game is to replay. Safe to do:
// the vendored engine imports dompurify (see replaySimCore.ts's neighbour,
// src/vendor/openfront-core/README.md), which needs `window` to construct a
// real sanitizer - but dompurify itself checks `typeof window` and degrades
// to a harmless no-op instead of throwing when there isn't one (there's no
// `window` in a Worker), and nothing on the reachable replay path ever
// actually calls `.sanitize()`. Confirmed no other file in the vendored
// engine touches `window`/`document`/`navigator` either.
//
// Since this thread never blocks the UI, there's no jank to trade against -
// yields only need to happen often enough to flush progress messages and
// let the wall-clock safety cap in computeGameTileStats get checked.
import { computeGameTileStats } from './replaySimCore'

const YIELD_EVERY_TICKS = 300

interface RequestMsg {
  gameId: string
}

self.onmessage = (e: MessageEvent<RequestMsg>) => {
  const { gameId } = e.data
  computeGameTileStats(gameId, {
    yieldEveryTicks: YIELD_EVERY_TICKS,
    onProgress: (p) => self.postMessage({ type: 'progress', gameId, ...p }),
  }).then((stats) => {
    self.postMessage({ type: 'result', gameId, stats })
  })
}
