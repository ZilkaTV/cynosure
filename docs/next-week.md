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

## 6. Overview carousel, 90-day numbers on Monthly Team - dev
- A window under the game nights card (`src/components/ClanCarousel.tsx`): arrows left/right, dots below (current one coloured). Slides: clan totals,
  games this week, clan streak, most improved. The tiles it replaces are gone from the overview body.
- "OpenFront Clan Leaderboard - Last 90 Days" (Games / Win Score / Loss Score / Ratio) now sits on the Monthly Team page.

## 7. Access system ("premium"), dev only - `src/lib/access.ts`
- A member keeps access for 7 days after their last qualifying win; after that every page except /register and /donate shows the
  "access expired" page (`AccessExpired.tsx`). The days left (or "permanent" / "expired") are shown under the name, top right.
- Qualifying win (always a game with the [CYN] tag): ranked 1v1 / 2v2 / FFA, or a public FFA with more than 10 players, or a team game with at
  least 2 registered [CYN] members in it.
- Permanent (no 7-day rule): Discord server boosters (`cyn_boosters`, mirrored by `scripts/discord-role-sync.mjs` from Discord's premium_since;
  table: `worker/d1/boosters.sql`, run once by the owner), Gold Legionnaire (250 all-time wins), supporters (`cyn_supporters`, set by an admin
  after a donation of at least 5 EUR). Also exempt (safety net, not asked for): event admins and the inner circle.
- Evaluated in the browser from the roster (it holds every member's games); it is a soft gate, not server security.
- Today's numbers (real data): 2 permanent by wins, 26 with days left, 81 expired (mostly inactive members).

## 8. Speedrun: speed check (dev) - `worker/speedCheck.mjs`
- Real time of the record (`duration`) against game time (`num_turns` / 10, or the engine's exact win time in `verify-speedruns.mjs`): game time
  more than 15 % + 5 s above the real time = played sped up -> refused. Real board runs all show game time = 0.96 x real time; game eBdBGzHs
  (jr_Bambi) shows 5.57 x: 1280 s of game time in 230 s. The live site (master) still verifies such a game, its check does not look at this.
- Slow motion is only caught when the real time is above 1.5 x game time + 90 s (half speed yes, three-quarter speed no): `duration` also
  covers the time until the player leaves after the win.
- boosters table: `worker/d1/boosters.sql` is on the dev database; the real one still needs
  `npx.cmd wrangler d1 execute cynosure --remote --yes --file worker/d1/boosters.sql` (PowerShell: `npx.cmd`, not `npx`).

## 9. Social strip, comments, post-game report (dev) - 2026-10-29
- Under every game on Home (latest games) and History: like (tap = like, hover/hold = all reactions, same `cyn_kudos` reactions as before), comment
  (opens the report at its comments), save, share (`/history?game=ID` opens the report). `GameActionsBar.tsx`, `useGameActions`, `useOpenReport`.
- Comments + replies to comments + reactions on comments: `src/lib/comments.ts`, `GameComments.tsx`; tables `cyn_game_comments`,
  `cyn_comment_reactions` (`worker/d1/004-game-comments.sql`, rules in `worker/dbApi.js`: members write as themselves, 500 characters, blocked words,
  3 per 30 s; author or admin deletes). **On the dev database; the real one needs the .sql file run once before this goes live.**
- Post-game report (`GameDetailModal.tsx`): sorted by max tiles; team games rank TEAMS 1, 2, ... by the sum of their players' max tiles
  (members under the team); top 10 places then "show more"; clan Win/Loss scores in a column beside the table, one tag under the other.
  Limit: OpenFront does not say who was on a losing team, so a team = the winners, or the players of one clan tag; untagged players stand alone.
- Removed: chat moderator buttons (MemberProfile, `chat.ts`), Score planner page + nav entry (now windows under the game nights on Monthly Team:
  `PlannerWindows.tsx`; `/planner` redirects), the 2 site-visit cards on Metrics became 1 (8 cards).
- Profile trends: all wins, 1v1, 2v2, FFA Elo. FFA Elo needs a new snapshot column: `worker/d1/003-snapshot-ffa.sql` (dev done; run it on the real
  database BEFORE the refresh job of this branch runs there, else the snapshot upserts fail silently). The FFA curve fills from now on.
- Events: ended = red badge, live = green (also in the picker).
- "What's new" window: `src/data/changelog.ts` + `WhatsNew.tsx`; once per browser per entry id, real site only, `?whatsnew=1` previews. List is EMPTY
  until the release text is written.
- `cyn_boosters` was missing in `worker/d1/usersMeta.js` (the data API rejected the table): added.

## 10. History/Home rows, header, roles - dev, 2026-10-29
- History: "Private / Incomplete" is one filter button; a search box (player name, OpenFront id or game id) like the one on Home.
- Mode column names the ladder: "1v1 (ranked)", "2v2 (ranked)", "FFA (ranked)" (`src/lib/gameRows.ts`, also used by Home's latest games). For ranked
  games "Win Score / Elo" shows the Elo the game gave and "Ratio" shows the member's win rate in that ladder ("WR 67 %"); other games without a clan
  ratio also show the win rate. Elo per game exists only where the ranked feed (`cyn_ranked_matches`, `d` / `c`) tracked it = players in the top 100;
  everybody else shows "-".
- Header: profile search left of CynClan.com (own row under 1280 px), "Inner circle only" under Game nights / Metrics, under the name the roles
  (Inner Circle, Captain of a running event, Leader / Officer / Member from OpenFront's clan list - `src/lib/roles.ts`), the title next to the level.
- Clan overview: the 1v1, 2v2 and FFA Elo columns and their note are gone.

## 11. Header buttons, queue, trends gone - dev, 2026-10-29
- Buttons top right share one size (`.top-btn` in `index.css`); Game nights and Metrics glow gold (`.top-btn-inner`). The crest sits below that row now.
- Events menu entry pulses with a green "Active" while an event has status `live` in `src/data/events.ts` (none right now).
- Trends page and menu entry removed (`/trends` redirects home); the data is in the profile windows and on Metrics.
- Live Ranked Queue: lamp, last 5 min, last 15 min in one row of equal cards; the 30-minute number is gone (the lamp still uses it, rule text under the row).
- Game tables: ranked modes in gold, "(Compact)" in gold behind the map of ranked games. The size comes from OpenFront once per game and is kept in the
  browser (`fetchGameMapSize`); `mapSize` is also stored in new post-game reports (`scripts/refresh-details.mjs`).

## 12. Rows, badges, report - dev, 2026-10-29
- Win rate colours in the game rows: up to 30 % red, 31-50 grey, 51-74 green, 75-99 blue, 100 % shiny gold (`winRateClass`, `.text-shine`).
  Ranked rows show the Elo before the game (from the ranked feed, top 100 only) and the change after it.
- Profile badges: only earned ones; a button next to the heading shows / hides the locked ones.
- Language button: flag, language name and "Select language"; all four buttons top right are exactly 140 x 48 (`shrink-0`, they were squeezed before).
- Post-game report: id, date and replay in the middle of the header; clan score cards narrower, 7 shown then "show more", [CYN] first, then the
  order of OpenFront's clan leaderboard, clans not on it alphabetically; the team explanation text is gone.

## 13. Menu, archive, clickable strip - dev, 2026-10-29
- Game nights moved from the button row into the account menu (own row, gold, inner circle only); the header now has Update, language, Metrics.
- Admins: account menu entry "Archived" -> `/archive` (`src/pages/Archive.tsx`) with the survey and the survey results (the two menu entries moved there). New
  archived things get a card in `items`.
- The whole actions strip under a game opens the report (buttons keep their own action).
- Clan score column of the report is as tall as the table, the cards share the height.

## 14. Header buttons again - dev, 2026-10-29
- Language, Metrics and the account button share one height (72 px, width follows the content, `.top-btn`); Update is a small button under CynClan.com (`.top-btn-sm`);
  Game nights sit above Settings in the account menu.

## 16. Strip back as a second row, profile - dev, 2026-10-29
- The social strip is again its own line under each game (labelled buttons), but bigger, and the game (info row + strip) is one table body that highlights
  as a whole. Same strip under the last games on the profile (with Elo / ranked gold like Home and History).
- Profile button: arrow that shows it is a menu; Update button a bit bigger.
- Overview: every name with a Discord wins role (50 wins bronze, 100 silver, ...) slides between two colours of that role with a soft pulsing glow (`winsRoleGradient` in `badges.ts`, `.role-name` in `index.css`).
- Career window: FFA Elo next to 1v1 and 2v2.

## 17. Lists show 10 then "show all" - dev, 2026-10-29
- Monthly FFA/Team, the ranked boards, speedrun leaderboard, clan list, History (pages of 10), live queue and the last games on the profile show 10
  rows and a button for the rest (Home's member table and the latest games already did).
- Career window: 1v1, 2v2 and FFA Elo side by side in one row.

## 18. Role names everywhere, win rates in colour - dev, 2026-10-29
- `RoleName` / `useWinsIndex` (`src/components/RoleName.tsx`): the name (not the flag) of every member with a wins role slides between two shades with a soft glow.
  Used by `MemberNameLink` (all tables, comments, ...), the profile title, the player column of Home / History (`RosterNames`) and [CYN] players in the report.
- Win rates are coloured like in the game rows (`winRateClass`): Monthly FFA / Team / 1v1 / 2v2 tables and the profile breakdown bars.

## 19. Rows - dev, 2026-10-29
- Player column (Home, History): a member who played under another in-game name gets the registered name in gold brackets behind it (`registeredByName`).
- The info row of a game is bigger than the strip below it; Home's latest games end with a "Show more" button that opens History.
- Member table: small box "Registered only" next to the search (`StatsTable` `toolbar`).

## 20. Titles, warning colour, tiles - dev, 2026-10-29
- Monthly FFA: the three title cards Grinder (points), Predator (avg kills), Pro Player (win streak) are back; Ranked FFA has no Top rated / Climber cards.
- 0 % win rate = warning: red that slides light to dark and pulses (`.text-warn`, from `winRateClass(0)`), in all win-rate cells.
- Speedrun "tiles at 3 min": under 9.1 % red, to 10 grey, to 12 green, under 15 blue, 15 % and more pulsing gold (`tilesClass`).
- Monthly FFA table: the average kills column is back (after Streak, sortable).
- Win rate column: far right in Monthly FFA, between gold/min and Win Score in Monthly Team.
- Profile badges: the "show locked" button became a checkbox "Show all" next to the title (same box as "Registered only" on the overview).

## 21. Smaller things - dev, 2026-10-29
- Speedrun: "Start a run" and "Post your run" are the same size. The OpenFront-profile note under the lifetime window is gone.
- Live queue notification: a third switch for ranked FFA (setting stored as a list, "1v1,ffa"; old "both" still works). `src/lib/storage.ts`: a full
  localStorage drops the rebuildable OpenFront caches so a setting can still be saved (the caches had filled the quota in a test browser).
- "1 day left" under the name is a red warning that slides and pulses (`.text-warn`).
- Saved games: remove drops the game from the list at once (no waiting for the reload). I found no confirmation dialog in the code.
- Reaction chips (emoji + number) open a window with who reacted with what, the most used emoji first; own reaction can be removed there.
- Player column: a name is matched to the members of THAT game (not by name over the whole roster): two members had once played a game as "zilka", which put
  "(revenflok.)" behind the real Zilka. Names several members played under no longer colour anything in the report either. The column shows up to 10 names.

## 22. CYN Hero Skin event + Factor Wheel - dev, 2026-10-29
- New event (upcoming, 1 Nov - 31 Dec 2026 23:59 German time) in `src/data/events.ts` (`kind: 'raffle'`): goal clan leaderboard rank 7 (with the current rank),
  prize, how to take part, points, the two skin pictures (`public/events/cyn-hero-*.webp`), rendered by `RaffleCard` in `Events.tsx`.
- Factor Wheel (`src/components/FactorWheel.tsx`, `src/lib/raffle.ts`): filled from the site's stats, nobody types anything in. Entries = members with at least one team
  game in the event window with another registered CYN member; weight = base (+3 server booster, +3 supporter/donation, nobody starts with 1) + games (+1 per game, win or loss, only with another CYN member; was +2.5 per
  full 50) + Win Score (+1 per full 10). The table (top 10, then all) is public, the SPIN button and "remove winner" are admin only.
  `/events?wheelFrom=2026-10-01` previews the wheel as if the event had started that day.
- Update: the games factor is +1 per team game with another registered CYN member, win or loss alike (instead of +2.5 per 50 games).
- The two skin pictures sit in the "Prize" block now. Discord server boosters are on the wheel from the start (base weight 3, even before a first team game) as soon
  as `cyn_boosters` knows them; the role-sync job of this branch fills that table from Discord. It is empty right now (checked on the real and the dev database).
- Boost counts: `worker/d1/005-boosts.sql` adds `cyn_boosters.boosts` (Discord only tells "boosting", not how often) and seeds the boosters of 2026-10-29
  (Zilka 2, Chuma 2, Kaizeron 2, Tim21 3). The wheel gives +3 per boost (weights 6, 6, 6, 9). Done on the dev database; **the real database needs this file once
  before the merge.** The role-sync job only adds and removes rows, so the counts stay; a new booster starts with 1.
- Events page: no picker above; every event is a window of its own with the fold arrow top right (CYN Hero Skin open, the ended Trio Challenge folded).
- The CYN Hero Skin event changes its status by itself from its time window (`windowFrom` / `windowTo`): "Upcoming" until 1 Nov 00:00 German time, then "Live"
  (the Events menu entry then pulses green "Active"), "Ended" after 31 Dec 23:59. Nothing has to be released on 1 November for that; the code only has to be on the
  main site by then.
- Skin pictures: the folder was `public/Events` with a capital E on this Windows disk, so a deploy from here put the pictures at /Events/ and the lowercase URL found nothing on the server (Linux). Renamed to lowercase; git always had it lowercase, so the main site (built on Linux) was never affected. The points list now starts with "1 game = 1 point".
