# Vendored OpenFront core (headless simulation) - 16be9d7 pin

**This is one of several vendored engine trees**, kept side by side with
`src/vendor/openfront-core` (pinned to `dcc18d5...`) and
`src/vendor/openfront-core-aeb8d60` - see
`src/vendor/openfront-core/README.md`'s "Multiple vendored commits" section
for why a single pin doesn't work, and `src/lib/replaySimCore.ts`
(`KNOWN_ENGINE_COMMITS`, `loadCreateGameRunner`) for the registry that picks
between them per game based on that game's own `gitCommit`.

- Source: https://github.com/openfrontio/OpenFrontIO (AGPL-3.0-or-later)
- Pinned commit: `16be9d7c15d7abc115691def3a0b2aa559664705`
- Every vendored `.ts` file has a top-of-file comment with its exact upstream
  path and whether it's an unmodified copy or was trimmed for this build.

## Why this commit

Found via a real reported game: a Team match on Venice (`GWMNzCWe`, Duos,
400 bots) whose Post Game Report showed no detected winner and implausibly
low Max Tiles for every player - the team win condition (95% combined
territory) had clearly been met in the real game, but neither of our two
previously vendored commits (`dcc18d5`, `aeb8d60`) matched this game's own
`gitCommit`, so the replay was silently running against the wrong engine
version (see the other two READMEs for why that produces exactly this kind
of wrong-but-plausible-looking result, not a clean error).

## What was trimmed and why

Same category of trims as the other two vendored commits, reapplied fresh
against this commit's actual code (each vendored file's own header notes
whether it was trimmed and how):

- `configuration/Config.ts`, `execution/Util.ts`, `game/GameImpl.ts`,
  `game/UnitGrid.ts`: dropped the `PlayerView`/`GameView`/`UnitView` union
  arms and their `client/view` imports - confirmed every affected call site
  only needs the plain `Player`/`Game`/`Unit` interface, same as both prior
  passes.
- No `Theme` interface exists in `configuration/Config.ts` at this commit
  either (it stayed moved out to `client/theme/ThemeProvider.ts`, same as at
  `dcc18d5` - nothing to trim here, consistent with that pass).
- `core/GameRunner.ts`'s config construction: already `new Config(gameStart.config, null, false)` with no factory, no `GAME_ENV`, no
  `DevConfig`/`ConfigLoader` machinery - same simplified shape as `dcc18d5`.
  Vendored unmodified.
- `client/hud/NameBoxCalculator.ts`: same path as the `dcc18d5` pin (moved
  from `client/graphics/` before that pin already).
- `core/game/GameUpdateUtils.ts`: dropped `applyStateUpdate` and its
  `client/render/types` `PlayerState` import - its only caller repo-wide is
  `client/view/PlayerView.ts`, not part of a headless replay;
  `game/PlayerImpl.ts` (the only in-closure importer) only uses
  `diffPlayerUpdate`, `packAttackTroopDeltas`, and the two `ATTACK_DELTA_*`
  constants.
- `execution/AttackExecution.ts`, `execution/TradeShipExecution.ts`,
  `execution/TransportShipExecution.ts`, `game/GameImpl.ts`: repointed
  `renderNumber`/`renderTroops` at `core/utilities/RenderNumber.ts` (not an
  upstream file) instead of `client/Utils.ts` - confirmed byte-identical
  logic to both prior pins by diffing the function bodies directly.
- `core/Schemas.ts`: repointed the `resources/QuickChat.json` import (an
  upstream path-alias import this vendor build doesn't replicate) at the
  relative copy in `src/vendor/openfront-core-16be9d7/resources` - content
  confirmed unchanged from the `dcc18d5` pin's copy by diff.
- `client/render/gl/GraphicsOverrides.ts` vendored **unmodified** - a plain
  `zod` schema pulled in via `game/UserSettings.ts`, same as both prior
  pins.
- `core/PseudoRandom.ts`: no `seedrandom` import at this commit either (the
  hand-rolled sfc32 generator, same as `dcc18d5` and unlike the older
  `aeb8d60` pin) - no `seedrandom`/`@types/seedrandom` dependency needed for
  this tree.

Reachable closure from `GameRunner.ts` (recomputed fresh for this commit,
not assumed from the prior pins): 126 files, matching the pattern of both
earlier passes almost exactly (124 `core/*` files + the same 2 `client/*`
files). Verified after trimming that no `client/*` reference remains except
those two, and that the only bare (npm) imports left are `zod`, `dompurify`,
`jose`, and `nanoid` - already in `package.json` from the other pins, no new
dependency needed for this one.

## npm dependencies

No new dependencies were needed for this pin - it uses the same
`zod`/`dompurify`/`jose`/`nanoid` set as the other two vendored trees, and
(like `dcc18d5`) doesn't need `seedrandom`.

## Updating

See `src/vendor/openfront-core/README.md`'s "Updating" section - the same
process applies here.
