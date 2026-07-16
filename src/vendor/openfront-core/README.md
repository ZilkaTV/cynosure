# Vendored OpenFront core (headless simulation)

This directory contains a trimmed copy of OpenFront's game engine, used to
replay a completed game turn-by-turn so we can read off tile ownership at an
arbitrary point in time (something OpenFront's public API does not expose -
it only gives the final tile count via `stats.finalTiles`).

- Source: https://github.com/openfrontio/OpenFrontIO (AGPL-3.0-or-later)
- Pinned commit: `dcc18d5231af6253b0e991bf04a4c764982fe262`
- Every vendored `.ts` file has a top-of-file comment with its exact upstream
  path and whether it's an unmodified copy or was trimmed for this build.

## Why this specific commit, not current `main`

This matters more than it sounds like it should. OpenFront's public API
returns a `gitCommit` field on every game record - the exact engine commit
the server was running when that game was played. The simulation is fully
deterministic (seeded PRNG, no `Math.random()` anywhere in the reachable
code), so replaying a game requires running the *same version* of the
engine that produced it, not just a correct `GameStartInfo` and turn log.

This was found the hard way twice now. The first pass vendored current
`main` and fed it a real game log recorded on an older commit - the replay
diverged from a server-verified state hash immediately. That was fixed by
re-vendoring against `aeb8d60224e3eb72fdbae0fdf91ebb8a9affe77d`, the commit
that game had actually been played on.

`aeb8d60` then went stale itself. A user-reported game, `GEiyYVf3` (winner
"Zilka", clientID `cSMFsmtk`, confirmed via both OpenFront's in-client stats
table and the openfront-tools.frozenpenguin.media replay viewer to have
finished at 80.2% tile ownership), has a `gitCommit` of
`dcc18d5231af6253b0e991bf04a4c764982fe262` - a different commit from the
`aeb8d60` pin. Replaying `GEiyYVf3` against the stale `aeb8d60` pin computed
only ~2.8% for the same player, and crashed partway through in a clean run
("Game tick error: Cannot read properties of undefined (reading
'unitInfo')") after only ~301 of 9211 ticks - a unit-type enum/config
mismatch between the two engine versions, not a bug in the replay logic
itself. Re-vendoring against `dcc18d5` (the commit this game actually ran
on) is what produces the correct ~80% result.

None of this is a bug in either vendoring pass - it's normal engine
development between commits, and a replay is only bit-exact against the
commit it was actually played on. Diffing `aeb8d60` -> `dcc18d5` confirmed
real logic/API changes in the reachable path: `GameRunner` now builds its
`Config` with a plain `new Config(gameConfig, userSettings, isReplay)` call
(the `DefaultConfig`/`getGameLogicConfig`/`GAME_ENV` split from `aeb8d60` no
longer exists - `Config` and `DefaultConfig` were merged upstream),
`NameBoxCalculator.ts` moved from `client/graphics/` to `client/hud/`, a
`GameUpdateUtils.ts` gained a client-only `applyStateUpdate` helper we had
to trim again, and more.

**Implication for future games**: this single pinned commit will drift from
whatever the live server is running, the same way both prior pins did.
Games played long after this commit will replay less accurately the further
the server's engine has moved on. A more robust version of this feature
would read each game's own `gitCommit` and fetch/build against that specific
commit per game - a meaningfully bigger undertaking (dynamic source fetch +
build, or a small matrix of pre-vendored commits) that's out of scope here.
Re-vendoring against a recent commit periodically (as done here, twice now)
is the cheap mitigation, and should be expected as ongoing maintenance
rather than a one-time fix.

## Why vendored instead of an npm/git dependency

`npm install github:openfrontio/OpenFrontIO` was tried first and does
install (confirmed working, no build errors) but pulls in the entire
application repo as a dependency: 774 MB of node_modules, most of it
`resources/` (map binaries and art for every game mode, none of which we
need - we fetch just the Australia map files directly) plus the full client
rendering stack (pixi.js, lit, tailwind v4, express/ws server code) that a
static clan-stats site has no use for. The install alone took 5.5 minutes.
That's a real cost on every `npm install` and every Vercel build, for a
package with no `main`/`exports` field (it's an application, not a
publishable library) built against a newer TypeScript/Vite toolchain than
Cynosure's.

Vendoring just the reachable simulation code avoids all of that. The
dependency closure starting from `GameRunner.ts` needed for a headless
replay is small (124 files, ~1.3 MB of source) and turned out to be nearly
self-contained already - the only non-`core` files it pulls in are
`client/hud/NameBoxCalculator.ts` (moved from `client/graphics/` at an
earlier commit - it has moved before and may move again) and
`client/render/gl/GraphicsOverrides.ts`, both of which themselves only
depend on core types (or, for the latter, just `zod`).

## What was trimmed and why

A handful of core files reach into OpenFront's rendering client purely for
TypeScript union types (`Player | PlayerView`, `Game | GameView`,
`Unit | UnitView`) that let a function accept either a real simulation
object or the client's read-only rendering wrapper around it. Our headless
replay only ever constructs real `Player`/`Game`/`Unit` instances - it never
touches the rendering client - so those wrapper types are always the unused
half of the union. Pulling in `client/view/GameView.ts` to satisfy them
would have dragged in `lit`, `colord`, `colorjs.io`, `intl-messageformat`,
and OpenFront's whole theming/i18n/worker-bridge stack for zero functional
benefit (confirmed by tracing the closure with the union arms left in: it
balloons to 159 files, pulling in `client/theme/*`, `client/render/frame/*`,
`client/render/types/*`, `client/components/*`, `client/Lang*`,
`client/ModalRouter.ts`, `client/Platform.ts`, and `core/worker/*`).

Trimmed accordingly, each noted at the top of the affected file:

- `configuration/Config.ts`, `execution/Util.ts`, `game/GameImpl.ts`,
  `game/UnitGrid.ts`: dropped the `PlayerView`/`GameView`/`UnitView` union
  arms and their `client/view` imports. Confirmed safe by checking every
  call site that touches a union-typed value - all of them call methods
  that exist on the plain `Player`/`Game`/`Unit` interfaces.
- A `Theme` interface / `Config.theme()` and color-palette classes existed
  in the previous (`aeb8d60`) vendoring pass and had to be trimmed there.
  At this commit, `Theme` has moved out of `configuration/Config.ts`
  entirely upstream (it now lives in `client/theme/ThemeProvider.ts`,
  outside our reachable closure already) - nothing to trim here this time,
  but worth noting for the next re-vendoring pass in case it moves back.
- `core/GameRunner.ts`'s config construction: at the previous pin this
  needed replacing an async `getGameLogicConfig(gameStart.config, null)`
  factory (keyed off a build-time `GAME_ENV` var Cynosure's Vite build never
  sets) with a direct `new DefaultConfig(prodConfig, gameStart.config, null,
  false)`. At `dcc18d5`, upstream has already done the equivalent
  simplification itself - `Config` and `DefaultConfig` were merged into one
  concrete `Config` class, and `GameRunner.createGameRunner` already calls
  `new Config(gameStart.config, null, false)` directly with no factory, no
  `GAME_ENV`, and no `DevConfig`/`ConfigLoader` machinery. Vendored
  unmodified.
- `execution/AttackExecution.ts`, `execution/TradeShipExecution.ts`,
  `execution/TransportShipExecution.ts`, `game/GameImpl.ts`: these called
  `renderNumber`/`renderTroops` from `client/Utils.ts`, a large file whose
  other exports need `intl-messageformat` and more client-only modules for
  translation. Repointed at `core/utilities/RenderNumber.ts` (not an
  upstream file - written for this vendor build, noted as such in its
  header). The two functions' logic is byte-for-byte identical to the
  `aeb8d60` pin's version, so the existing extracted file needed no content
  changes, just a header update.
- `core/Schemas.ts`: the `resources/QuickChat.json` import relies on a path
  alias upstream sets up in its own tsconfig/vite config, which this vendor
  build doesn't replicate. Pointed it at the copy in
  `src/vendor/openfront-core/resources` with a relative import instead
  (content of `QuickChat.json` is unchanged between the two pinned commits).
- `core/game/GameUpdateUtils.ts` (new file in this vendor pass - either
  didn't exist or wasn't in the reachable closure at `aeb8d60`): dropped the
  `applyStateUpdate` function and its `PlayerState` import from
  `client/render/types`. Its only caller in the whole repo is
  `client/view/PlayerView.ts`, which isn't part of a headless replay;
  `game/PlayerImpl.ts` (the only in-closure importer of this file) only
  uses `diffPlayerUpdate`, `packAttackTroopDeltas`, and the two
  `ATTACK_DELTA_*` constants, none of which need that type.

`client/render/gl/GraphicsOverrides.ts` (pulled in by `game/UserSettings.ts`,
itself pulled in by `configuration/Config.ts`'s `UserSettings | null`
constructor param) was vendored **unmodified** rather than trimmed - unlike
the `Theme`/union-type cases, it's a plain `zod` schema with no further
client dependencies, so there was nothing to gain by extracting or stubbing
it.

`core/worker/*` (the browser-Worker postMessage bridge) was checked again at
this commit and confirmed still not in the reachable closure - it's only
pulled in transitively through `client/view/GameView.ts`, which the trims
above keep out entirely.

## npm dependencies

The vendored code itself needs `zod`, `dompurify`, `jose`, and `nanoid`
(confirmed by grepping the final 124-file closure for bare/non-relative
imports) - added to Cynosure's `package.json`. Unlike the `aeb8d60` pin,
`dcc18d5231af6253b0e991bf04a4c764982fe262`'s `PseudoRandom.ts` is a
hand-rolled sfc32 generator with no `seedrandom` import at all (the rewrite
the `aeb8d60`-era README's diff-notes had already flagged as coming in a
later commit) - `seedrandom` and `@types/seedrandom` were removed from
`package.json` accordingly. `dompurify` needs a `window`, which is why the
replay runs in the browser rather than a Vercel serverless function - see
`src/lib/replaySim.ts` for that decision.

## Updating

To pick up a different OpenFront commit (see the drift warning above for
why you'd want to, periodically): clone
`https://github.com/openfrontio/OpenFrontIO` at the new SHA, recompute the
dependency closure from `src/core/GameRunner.ts` and whichever
`NameBoxCalculator.ts` path that commit uses (it has moved before - check
`src/client/graphics/` and `src/client/hud/`), reapply trims analogous to
the ones described above (the exact files/APIs involved may have moved -
check for `PlayerView`/`GameView`/`UnitView` union usages, a `Theme`
interface anywhere in `configuration/`, how `GameRunner.createGameRunner`
builds its `Config`, and whether any newly-reachable file pulls in a
client-only type like `GameUpdateUtils.ts`'s `PlayerState` did this time),
verify what `PseudoRandom.ts` actually imports before assuming the npm
dependency list is unchanged, and update the pinned SHA in every file
header, in `src/lib/replaySimCore.ts` (`VENDORED_COMMIT`), and in this
README.
