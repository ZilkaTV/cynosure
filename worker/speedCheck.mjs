// A solo game is simulated in turns of 100 ms. Played at normal speed the real time (the record's `duration`, seconds) is at least the game
// time (turns / 10). OpenFront's fast-forward setting runs the turns faster, so the real time comes out SHORTER than the game time: the
// record then shows it (a game of 21 minutes recorded as 230 s real time = about 5.5x speed). The in-game clock the speedrun board uses is
// not changed by that, but a run played at another speed is not a run played under the same conditions, so it is refused.
//
// Slow motion is only partly detectable: `duration` runs until the connection closes, a little after the win in every real run checked
// (about 14 s) but possibly long after it, so only a real time far above the game time is refused (a half-speed run is caught, a
// three-quarter-speed run is not).
//
// Shared by worker/speedrun.js (before queueing) and scripts/verify-speedruns.mjs (with the engine's exact win time).
export const TURNS_PER_SECOND = 10
const TOLERANCE = 1.15
const SLACK_SECONDS = 5
const SLOW_FACTOR = 1.5
const SLOW_SLACK_SECONDS = 90

/** Null = fine, otherwise the reason. `winSeconds` = in-game clock at the win from the engine replay (more exact than the turn count). */
export function checkGameSpeed(info, winSeconds = null) {
  const wall = Number(info?.duration)
  const turns = Number(info?.num_turns ?? info?.numTurns)
  if (!(wall > 0)) return null
  const gameSeconds = winSeconds ?? (turns > 0 ? turns / TURNS_PER_SECOND : null)
  if (gameSeconds == null || !Number.isFinite(gameSeconds)) return null
  if (gameSeconds > wall * TOLERANCE + SLACK_SECONDS) {
    return `This game was played sped up: ${Math.round(gameSeconds)} s of game time passed in ${Math.round(wall)} s of real time (about ${(gameSeconds / wall).toFixed(1)}x speed). Runs must be played at normal speed.`
  }
  if (wall > gameSeconds * SLOW_FACTOR + SLOW_SLACK_SECONDS) {
    return `This game took ${Math.round(wall)} s of real time for ${Math.round(gameSeconds)} s of game time - it was played in slow motion or left open long after the win. Runs must be played at normal speed.`
  }
  return null
}
