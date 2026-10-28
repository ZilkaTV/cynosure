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

## 2. Premium for members who play under another clan tag - proposals only (owner's choice: write ideas, build nothing yet)
Today only games with the [CYN] tag count, so a member with another tag gets nothing on the site.
- **A. Second tag per member**: the member enters the other tag in the profile; their games with that tag count for their personal stats (not
  for the clan's Win/Loss Score, which OpenFront computes by tag). + simple, automatic; - needs a profile field and a check that the tag
  really is theirs (the game record has the tag per player, so it can be verified).
- **B. "Guest" status in the roster**: shown in the member list with a mark, own stats visible, left out of the clan totals and the CYN
  leaderboards. + honest numbers; - two kinds of members.
- **C. Premium perks (supporters)**: the already existing supporter badge/heart, plus: personal stats page with all games regardless of tag,
  history charts, own speedrun entry; paid by donation. + fits the donation button; - the owner has to decide what is "premium".
- **D. Request by hand**: the member asks, an admin links the other tag once (stored in `cyn_members`). + no abuse; - manual work.
Recommendation: A (verified by the game record) first, C as the "premium" layer on top.

## 4. Monthly FFA ranking, 5. Quests and badges - no preference given, nothing changed
- Monthly FFA is already ranked by the ranking (Elo), on the real site. Open ideas: month winner / top 3 badges at month end, or a points
  formula by placement and player count.
- Quests now: ffa_win, team_win_friend, bump, ranked_win, ranked_2v2_win, react_game, speedrun_post (`src/lib/quests.ts`). Open ideas: a ranked
  FFA quest and a clan-war quest for the new v0.35 modes.
- Badges (`src/lib/badges.ts`): level, star, 2v2 shield, ship, most wins, fastest, loyal, pusher, chatter, supporter, predator, pro, grinder,
  marine, destroyer, team grinder. Open ideas: a ranked-Elo badge (top 100 of the ranked leaderboard), month winner badge.
Build any of these only after the owner picks one.
