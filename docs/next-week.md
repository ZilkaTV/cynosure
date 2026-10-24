# Branch `next-week` - offline work, not deployed

The branch holds work the owner wants online next week. Do not deploy it before they say so (`master` stays as it is).

## 1. Win Score in the 2v2 post-game report - done
- Ranked 2v2 and clan wars are no clan sessions at OpenFront, so the game report no longer shows Win Score / Loss Score / `[CYN] Ratio`
  or the other clans' scores for them (`isUnscoredTeamGame` in `src/lib/openfront.ts`, used by `GameDetailModal`).
- Game reports cached from now on keep `rankedType` (`refresh-details.mjs`, `fetchGameDetail`). Older cached reports have no
  `rankedType`: a 4-player game with two teams counts as a 2v2.

## 3. Speedrun verification - built, not yet tested end to end
What was weak: the browser checked the game, replayed it and wrote the row itself, so time and the `verified` flag could be forged by
calling the database API; the owner check compared a user name; nothing stopped two members submitting the same game.

New flow:
1. `POST /api/speedrun/submit` (`worker/speedrun.js`): signed-in member; the Worker reads the game record from OpenFront itself, checks the
   category rules and settings, that the winner's **public id equals the member's OpenFront id** (clan tag [CYN]), that the game is at most
   45 days old and not another member's game; then queues it (blob `speedrun-pending`) and starts the workflow.
2. `.github/workflows/verify-speedruns.yml` runs `scripts/verify-speedruns.mjs`: replays each game with the vendored engine
   (`scripts/speedrun-replay-one.mjs`), takes `floor(winSeconds)` and the land share at 3:00, and is the **only writer** of `cyn_speedruns`.
3. `cyn_speedruns` has no client write rule any more (`worker/dbApi.js`), `scripts/test-db-api.mjs` expects the denial.
4. The Speedrun page shows the member's submissions: waiting / verified / refused with the reason (`GET /api/speedrun/pending`).

Checked locally: the replay of the current best run gives 307.7 s -> 307 s and 14.93 % at 3:00, identical to the stored row; the record
check passes for it and refuses a cheat setting and a wrong map.

Deploy order (next week): merge the branch, `npx wrangler deploy` (Worker with the new routes), push (workflow file), run the workflow once
by hand (`gh workflow run verify-speedruns.yml`), submit a run from the site. No SQL needed (`verified` exists).

## 2. Premium ideas, 4. Monthly FFA ranking, 5. Quests and badges
Waiting for answers, see the chat.
