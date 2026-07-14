# Vendored OpenFront core (headless simulation)

This directory contains a trimmed copy of OpenFront's game engine, used to
replay a completed game turn-by-turn so we can read off tile ownership at an
arbitrary point in time (something OpenFront's public API does not expose -
it only gives the final tile count via `stats.finalTiles`).

- Source: https://github.com/openfrontio/OpenFrontIO (AGPL-3.0-or-later)
- Pinned commit: `aeb8d60224e3eb72fdbae0fdf91ebb8a9affe77d`
- Every vendored `.ts` file has a top-of-file comment with its exact upstream
  path and whether it's an unmodified copy or was trimmed for this build.

## Why this specific commit, not current `main`

This matters more than it sounds like it should. OpenFront's public API
returns a `gitCommit` field on every game record - the exact engine commit
the server was running when that game was played. The simulation is fully
deterministic (seeded PRNG, no `Math.random()` anywhere in the reachable
code), so replaying a game requires running the *same version* of the
engine that produced it, not just a correct `GameStartInfo` and turn log.

This was found the hard way: the first pass vendored current `main`
(`4def3ee2cc3e07c3e7c3464dbd9b12cdcca986b1`) and fed it the real
`GameStartInfo` and turn log for game `URdAfzpM` (played on
`aeb8d60224e3eb72fdbae0fdf91ebb8a9affe77d`, about 458 commits and two months
earlier). The result diverged immediately - openfront-tools.frozenpenguin.media
replaying the same game logs a server-verified state hash every 100 ticks
(`hash verified on turn N, client hash: X, server hash: X`), and the
mismatched-commit replay's hash didn't match the server's even at tick 0,
before a single turn had been processed, purely from constructing the
starting game state. Diffing the two commits confirmed real logic changes in
the reachable path - `PseudoRandom` was rewritten from a `seedrandom`-backed
implementation to a hand-rolled sfc32 generator, `GameRunner`'s config
loading changed from an async environment-aware factory
(`getGameLogicConfig`) to a direct `new Config(...)` call, `PlayerInfo`
gained new constructor params, spawn/execution ordering changed, and more.
None of that is a bug in this vendoring - it's just 458 commits of normal
engine development, and a replay is only bit-exact against the commit it
was actually played on.

Re-vendoring against `aeb8d60` (game `URdAfzpM`'s actual `gitCommit`) is what
produces the correct ~11% result documented in the main task write-up.

**Implication for future games**: this single pinned commit will drift from
whatever the live server is running, the same way the first attempt did.
Games played long after this commit will replay less accurately the further
the server's engine has moved on. A more robust version of this feature
would read each game's own `gitCommit` and fetch/build against that specific
commit per game - a meaningfully bigger undertaking (dynamic source fetch +
build, or a small matrix of pre-vendored commits) that's out of scope here.
Re-vendoring against a recent commit periodically is the cheap mitigation.

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
publishable library) built against TypeScript 6 / Vite 8, both newer majors
than Cynosure's TypeScript 5.6 / Vite 5.

Vendoring just the reachable simulation code avoids all of that. The
dependency closure starting from `GameRunner.ts` needed for a headless
replay is small (~120 files, ~1.3 MB of source) and turned out to be nearly
self-contained already - the only non-`core` file it pulls in is
`client/graphics/NameBoxCalculator.ts`, which itself only depends on core
types.

## What was trimmed and why

A handful of core files reach into OpenFront's rendering client purely for
TypeScript union types (`Player | PlayerView`, `Game | GameView`,
`Unit | UnitView`) that let a function accept either a real simulation
object or the client's read-only rendering wrapper around it. Our headless
replay only ever constructs real `Player`/`Game`/`Unit` instances - it never
touches the rendering client - so those wrapper types are always the unused
half of the union. Pulling in `game/GameView.ts` to satisfy them would have
dragged in `lit`, `colord`, `colorjs.io`, `intl-messageformat`, and
OpenFront's whole theming/i18n/worker-bridge stack for zero functional
benefit.

Trimmed accordingly, each noted at the top of the affected file:

- `configuration/Config.ts`, `configuration/DefaultConfig.ts`,
  `execution/Util.ts`, `game/GameImpl.ts`, `game/UnitGrid.ts`: dropped the
  `PlayerView`/`GameView`/`UnitView` union arms and their imports. Confirmed
  safe by checking every call site that touches a union-typed value - all of
  them call methods that exist on the plain `Player`/`Game`/`Unit`
  interfaces.
- `configuration/Config.ts` / `configuration/DefaultConfig.ts`: also dropped
  the `Theme` interface and `Config.theme()` (a dozen `Colord`-typed color
  accessors - `territoryColor`, `borderColor`, `terrainColor`, and so on -
  plus the `PastelTheme`/`PastelThemeDark` palette classes that implement
  them). Purely a rendering concern; the only caller in the reachable
  closure was `GameView.ts`, which isn't part of a headless replay. This
  drops `colord` and `colorjs.io` entirely.
- `core/GameRunner.ts`: replaced `await getGameLogicConfig(gameStart.config,
  null)` (an async factory that picks a config class based on a build-time
  `GAME_ENV` variable Cynosure's Vite build never sets, and would throw)
  with a direct `new DefaultConfig(prodConfig, gameStart.config, null,
  false)` - openfront.io always runs in prod, so this is the same class the
  factory would have picked anyway, just without needing `ConfigLoader.ts`,
  `DevConfig.ts`, or the environment-detection machinery around them.
- `execution/AttackExecution.ts`, `execution/TradeShipExecution.ts`,
  `execution/TransportShipExecution.ts`, `game/GameImpl.ts`,
  `game/PlayerImpl.ts`: these called `renderNumber`/`renderTroops` from
  `client/Utils.ts`, a large file whose other exports need
  `intl-messageformat` and more client-only modules for translation.
  Extracted just those two pure formatting functions into
  `core/utilities/RenderNumber.ts` instead (not an upstream file - written
  for this vendor build, noted as such in its header).
- `core/Schemas.ts`: the `resources/QuickChat.json` import relies on a path
  alias upstream sets up in its own tsconfig/vite config, which this vendor
  build doesn't replicate. Pointed it at the copy in
  `src/vendor/openfront-core/resources` with a relative import instead.

`src/core/worker/*` (the browser-Worker postMessage bridge) was not in the
reachable closure at all and was left out.

## npm dependencies

The vendored code itself needs `zod`, `dompurify`, `jose`, `nanoid`, and
`seedrandom` (this commit's `PseudoRandom` is backed by the `seedrandom`
package, not a hand-rolled generator) - added to Cynosure's `package.json`.
`dompurify` needs a `window`, which is why the replay runs in the browser
rather than a Vercel serverless function - see `src/lib/replaySim.ts` for
that decision.

## Updating

To pick up a different OpenFront commit (see the drift warning above for
why you'd want to, periodically): clone
`https://github.com/openfrontio/OpenFrontIO` at the new SHA, recompute the
dependency closure from `src/core/GameRunner.ts` and whichever
`NameBoxCalculator.ts` path that commit uses (it has moved before - check
`src/client/graphics/` and `src/client/hud/`), reapply trims analogous to
the ones described above (the exact files/APIs involved may have moved -
check for `PlayerView`/`GameView`/`UnitView` union usages, a `Theme`
interface, and how `GameRunner.createGameRunner` builds its `Config`), and
update the pinned SHA in every file header, in `src/lib/replaySim.ts`
(`VENDORED_COMMIT`), and in this README.
