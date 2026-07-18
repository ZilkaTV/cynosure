#!/usr/bin/env node
// Automates vendoring a new OpenFrontIO engine commit into
// src/vendor/openfront-core-<shortsha>/, following the exact process that
// was done by hand for the dcc18d5, aeb8d60, and 16be9d7 trees - see
// src/vendor/openfront-core/README.md for why this exists at all (a game
// only replays correctly against the exact commit it was played on, and
// the live engine moves on constantly).
//
// Usage: node scripts/vendor-engine.mjs <full 40-char commit sha>
//
// What it does, in order:
//   1. Clones/updates a local cache of OpenFrontIO and checks out the commit.
//   2. Computes the reachable import closure from core/GameRunner.ts.
//   3. Copies the needed files into src/vendor/openfront-core-<shortsha>/.
//   4. Applies the known mechanical trims (union-view types, renderNumber/
//      renderTroops repointing, QuickChat.json repointing, GameUpdateUtils'
//      applyStateUpdate removal) - each one verified against this specific
//      commit's actual code, not assumed from a prior pass.
//   5. Recomputes the closure on the trimmed tree and deletes any file that
//      turned out to be unreachable (e.g. core/worker/* once the client/view
//      dependency chain that pulled it in is gone).
//   6. Writes per-file vendoring headers, tsconfig.json, and a README.md.
//   7. Registers the commit in src/lib/replaySimCore.ts and the root
//      tsconfig.json's project references.
//   8. Runs `tsc -b` to verify the result actually compiles.
//
// This automates the *mechanical* part. It does NOT replace judgment: if
// this commit introduces a genuinely new pattern (e.g. a `Theme` interface
// moving back into Config.ts, or a brand-new client-only dependency this
// script doesn't know to trim), the tsc step at the end will fail and
// surface exactly what needs a human/agent look, the same way it would if
// you were doing this by hand.

import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const CACHE_DIR = path.join(ROOT, '.vendor-cache', 'openfront-src')
const REPO_URL = 'https://github.com/openfrontio/OpenFrontIO.git'

const commit = process.argv[2]
if (!commit || !/^[0-9a-f]{40}$/i.test(commit)) {
  console.error('Usage: node scripts/vendor-engine.mjs <full 40-char commit sha>')
  process.exit(1)
}
const shortSha = commit.slice(0, 7)
const destDir = path.join(ROOT, 'src', 'vendor', `openfront-core-${shortSha}`)

if (fs.existsSync(destDir)) {
  console.error(`${destDir} already exists - remove it first if you want to re-vendor this commit.`)
  process.exit(1)
}

function sh(cmd, opts = {}) {
  return execSync(cmd, { stdio: ['ignore', 'pipe', 'inherit'], cwd: ROOT, ...opts }).toString()
}

// ── 1. Clone / checkout ──────────────────────────────────────────────────

console.log(`[1/8] Preparing OpenFrontIO clone at ${commit}...`)
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(path.dirname(CACHE_DIR), { recursive: true })
  sh(`git clone --quiet ${REPO_URL} "${CACHE_DIR}"`)
} else {
  try {
    sh(`git -C "${CACHE_DIR}" fetch --quiet origin`)
  } catch {
    console.warn('  fetch failed (offline?) - trying with whatever is already cached')
  }
}
sh(`git -C "${CACHE_DIR}" checkout --quiet ${commit}`)
const srcRoot = path.join(CACHE_DIR, 'src')

// ── 2. Dependency closure walker ─────────────────────────────────────────

function resolveImport(fromFile, spec) {
  if (!spec.startsWith('.')) return null
  const base = path.join(path.dirname(fromFile), spec)
  for (const c of [base + '.ts', base + '.tsx', path.join(base, 'index.ts')]) {
    if (fs.existsSync(c)) return c
  }
  return fs.existsSync(base) ? base : null
}

function computeClosure(root, entryRel) {
  const seen = new Set()
  const bareImports = new Set()
  const missing = []
  const queue = [path.join(root, entryRel)]
  while (queue.length) {
    const file = queue.shift()
    const rel = path.relative(root, file).split(path.sep).join('/')
    if (seen.has(rel)) continue
    seen.add(rel)
    if (!fs.existsSync(file)) {
      missing.push(rel)
      continue
    }
    const content = fs.readFileSync(file, 'utf8')
    const importRe = /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?from\s+)?['"]([^'"]+)['"]/g
    let m
    while ((m = importRe.exec(content))) {
      const spec = m[1]
      const resolved = resolveImport(file, spec)
      if (resolved) {
        const relResolved = path.relative(root, resolved).split(path.sep).join('/')
        if (!seen.has(relResolved)) queue.push(resolved)
      } else if (!spec.startsWith('.')) {
        bareImports.add(spec)
      }
    }
  }
  return { files: seen, bareImports, missing }
}

console.log('[2/8] Computing reachable closure from core/GameRunner.ts...')
const { files: rawClosure, missing } = computeClosure(srcRoot, 'core/GameRunner.ts')
if (missing.length) {
  console.error('Unresolved imports while walking the closure:', missing)
  process.exit(1)
}
console.log(`  ${rawClosure.size} files in the raw (untrimmed) closure`)

// ── 3. Copy files into the new vendor tree ───────────────────────────────

console.log('[3/8] Copying files...')
fs.mkdirSync(destDir, { recursive: true })
for (const rel of rawClosure) {
  const from = path.join(srcRoot, rel)
  const to = path.join(destDir, 'src', rel)
  fs.mkdirSync(path.dirname(to), { recursive: true })
  // Normalize to LF: a local git checkout on Windows commonly applies
  // core.autocrlf and rewrites LF -> CRLF, which every \n-based regex below
  // (and the existing vendor trees, copied via `git archive`, which stay
  // LF) would otherwise silently fail to match.
  fs.writeFileSync(to, fs.readFileSync(from, 'utf8').replace(/\r\n/g, '\n'))
}
fs.mkdirSync(path.join(destDir, 'resources'), { recursive: true })
fs.writeFileSync(
  path.join(destDir, 'resources', 'QuickChat.json'),
  fs.readFileSync(path.join(CACHE_DIR, 'resources', 'QuickChat.json'), 'utf8').replace(/\r\n/g, '\n'),
)

// ── 4. Mechanical trims ───────────────────────────────────────────────────

console.log('[4/8] Applying known trims...')
const notes = new Map() // rel path -> array of note strings, for the header

function addNote(rel, note) {
  if (!notes.has(rel)) notes.set(rel, [])
  notes.get(rel).push(note)
}

function walkTsFiles(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walkTsFiles(full))
    else if (entry.name.endsWith('.ts')) out.push(full)
  }
  return out
}

const destSrc = path.join(destDir, 'src')
let trimmedUnionCount = 0
let trimmedRenderNumberCount = 0
let trimmedQuickChatCount = 0
let trimmedGameUpdateUtils = false

for (const file of walkTsFiles(destSrc)) {
  let content = fs.readFileSync(file, 'utf8')
  let changed = false
  const rel = path.relative(destSrc, file).split(path.sep).join('/')

  // 4a. `Xxx | XxxView` union arms + their `.../client/view` import line.
  const viewImportRe = /^import\s*\{([^}]+)\}\s*from\s*["']([^"']*\/client\/view)["'];?\s*$/m
  const viewImportMatch = content.match(viewImportRe)
  if (viewImportMatch) {
    const importedNames = viewImportMatch[1].split(',').map((s) => s.trim()).filter(Boolean)
    let anyUnionFound = false
    for (const name of importedNames) {
      if (!name.endsWith('View')) continue
      const base = name.slice(0, -'View'.length)
      const unionRe = new RegExp(`\\b${base}\\s*\\|\\s*${name}\\b`, 'g')
      if (unionRe.test(content)) {
        anyUnionFound = true
        content = content.replace(unionRe, base)
      }
    }
    if (anyUnionFound) {
      content = content.replace(viewImportRe, '')
      changed = true
      trimmedUnionCount++
      addNote(rel, `dropped the \`${importedNames.join(', ')}\` union arm(s) and the now-unused client/view import`)
    }
  }

  // 4b. renderNumber / renderTroops repointed off client/Utils.ts.
  const utilsImportRe = /from\s*["']([^"']*\/client\/Utils)["']/
  const utilsMatch = content.match(utilsImportRe)
  if (utilsMatch && /\brenderNumber\b|\brenderTroops\b/.test(content.slice(0, content.indexOf(utilsMatch[0]) + 200))) {
    const relToUtilities = path.relative(path.dirname(file), path.join(destSrc, 'core', 'utilities')).split(path.sep).join('/')
    const newSpec = (relToUtilities.startsWith('.') ? relToUtilities : `./${relToUtilities}`) + '/RenderNumber'
    content = content.replace(new RegExp(`from\\s*["']${utilsMatch[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`), `from "${newSpec}"`)
    changed = true
    trimmedRenderNumberCount++
    addNote(rel, 'repointed the renderNumber/renderTroops import at the local, non-upstream RenderNumber.ts extract instead of client/Utils.ts')
  }

  // 4c. resources/QuickChat.json path-alias import.
  if (content.includes('resources/QuickChat.json')) {
    const relToResources = path.relative(path.dirname(file), path.join(destDir, 'resources', 'QuickChat.json')).split(path.sep).join('/')
    content = content.replace(/["']resources\/QuickChat\.json["']/, `"${relToResources.startsWith('.') ? relToResources : `./${relToResources}`}"`)
    changed = true
    trimmedQuickChatCount++
    addNote(rel, 'repointed the resources/QuickChat.json path-alias import at the vendored copy with a relative import')
  }

  // 4d. GameUpdateUtils.ts's applyStateUpdate (client-only helper) - the
  // actual removal is deferred until after the closure is recomputed and
  // pruned (step 5): checking "does anything else call this" only means
  // something if that "anything else" is still reachable. Checking it here,
  // against files that are still physically on disk but already logically
  // orphaned by the union-type trims above (e.g. client/view/PlayerView.ts,
  // whose only reason for existing in this copy was the union arms we just
  // removed), would produce a false "still in use" - PlayerView.ts's own
  // source genuinely calls applyStateUpdate, but PlayerView.ts itself won't
  // be part of the real closure once orphans are pruned.
  if (rel === 'core/game/GameUpdateUtils.ts' && content.includes('export function applyStateUpdate')) {
    trimmedGameUpdateUtils = 'pending'
  }

  if (changed) fs.writeFileSync(file, content)
}

console.log(`  union-type trims: ${trimmedUnionCount}, renderNumber repoints: ${trimmedRenderNumberCount}, QuickChat repoints: ${trimmedQuickChatCount}`)

// Canonical RenderNumber.ts - copy from an existing tree, but verify the
// actual renderNumber/renderTroops bodies at this commit still match first.
const existingRenderNumber = fs.readFileSync(path.join(ROOT, 'src/vendor/openfront-core/src/core/utilities/RenderNumber.ts'), 'utf8')
const clientUtilsPath = path.join(srcRoot, 'client/Utils.ts')
if (fs.existsSync(clientUtilsPath)) {
  const clientUtils = fs.readFileSync(clientUtilsPath, 'utf8')
  const rnMatch = clientUtils.match(/export function renderNumber\([\s\S]*?\n\}/)
  const rtMatch = clientUtils.match(/export function renderTroops\([\s\S]*?\n\}/)
  const canonicalBody = existingRenderNumber.slice(existingRenderNumber.indexOf('export function renderNumber'))
  const thisBody = `${rnMatch ? rnMatch[0] : ''}\n\n${rtMatch ? rtMatch[0] : ''}\n`
  // Strips ALL whitespace (not just collapsing runs) and trailing commas -
  // this is a behavior check, not a formatting check, so a multi-line vs
  // single-line parameter list (trailing comma either way) shouldn't count
  // as a real difference.
  const normalize = (s) => s.replace(/\s+/g, '').replace(/,\)/g, ')')
  if (rnMatch && rtMatch && normalize(canonicalBody).includes(normalize(rnMatch[0])) && normalize(canonicalBody).includes(normalize(rtMatch[0]))) {
    console.log('  renderNumber/renderTroops body confirmed unchanged from the existing extract - reusing it verbatim')
  } else {
    console.warn('  WARNING: renderNumber/renderTroops body differs at this commit! Wrote the OLD extract anyway - diff and fix src/vendor/' + `openfront-core-${shortSha}/src/core/utilities/RenderNumber.ts` + ' by hand before trusting it.')
  }
} else {
  console.warn('  WARNING: client/Utils.ts not found at this commit - could not verify renderNumber/renderTroops body, wrote the old extract as-is.')
}
fs.mkdirSync(path.join(destSrc, 'core/utilities'), { recursive: true })
fs.writeFileSync(
  path.join(destSrc, 'core/utilities/RenderNumber.ts'),
  existingRenderNumber.replace(/commit [0-9a-f]{40}/, `commit ${commit}`).replace(/README\.md/, `openfront-core-${shortSha}/README.md`),
)

// ── 5. Recompute closure on the trimmed tree, prune orphans ──────────────

console.log('[5/8] Recomputing closure post-trim, pruning unreachable files...')
const { files: trimmedClosure } = computeClosure(destSrc, 'core/GameRunner.ts')
let prunedCount = 0
for (const file of walkTsFiles(destSrc)) {
  const rel = path.relative(destSrc, file).split(path.sep).join('/')
  if (!trimmedClosure.has(rel)) {
    fs.unlinkSync(file)
    prunedCount++
  }
}
// remove now-empty directories
function pruneEmptyDirs(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) pruneEmptyDirs(path.join(dir, entry.name))
  }
  if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir)
}
pruneEmptyDirs(destSrc)
console.log(`  pruned ${prunedCount} file(s) no longer reachable after trimming; ${trimmedClosure.size} remain`)

// Now that truly-orphaned files (e.g. client/view/PlayerView.ts, whose only
// reason for being copied was the union arms already trimmed above) are
// gone, it's safe to check whether GameUpdateUtils.ts's applyStateUpdate
// still has a real caller - checking this earlier, against files that were
// physically present but already logically dead, would false-positive
// (PlayerView.ts's own source genuinely calls it).
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}
function callsApplyStateUpdate(src) {
  return /(?<!function\s)\bapplyStateUpdate\s*\(/.test(stripComments(src))
}
// Removes one top-level `export function <name>(...) { ... }` and its
// immediately-preceding JSDoc comment (if any), located by literal string
// search + brace counting rather than a single regex - a regex spanning
// "from the first /** to the right export function" is not anchored to
// *this* function's own comment and can silently swallow an unrelated
// earlier function that also happens to have a doc comment.
function removeFunction(content, signature) {
  const fnIdx = content.indexOf(signature)
  if (fnIdx === -1) return content
  const braceStart = content.indexOf('{', fnIdx)
  let depth = 0
  let end = braceStart
  for (; end < content.length; end++) {
    if (content[end] === '{') depth++
    else if (content[end] === '}') {
      depth--
      if (depth === 0) {
        end++
        break
      }
    }
  }
  while (content[end] === '\n') end++
  let start = fnIdx
  let j = fnIdx - 1
  while (j >= 0 && /\s/.test(content[j])) j--
  if (content[j] === '/' && content[j - 1] === '*') {
    const commentStart = content.lastIndexOf('/**', j)
    if (commentStart !== -1) start = commentStart
  }
  while (start > 0 && content[start - 1] === '\n') start--
  return content.slice(0, start) + content.slice(end)
}
if (trimmedGameUpdateUtils === 'pending') {
  const guuPath = path.resolve(destSrc, 'core/game/GameUpdateUtils.ts')
  let content = fs.readFileSync(guuPath, 'utf8')
  const otherCallers = walkTsFiles(destSrc).filter((f) => path.resolve(f) !== guuPath && callsApplyStateUpdate(fs.readFileSync(f, 'utf8')))
  if (otherCallers.length === 0) {
    content = content.replace(/^import type \{ PlayerState \} from ["'][^"']*["'];\s*$/m, '')
    content = removeFunction(content, 'export function applyStateUpdate(')
    fs.writeFileSync(guuPath, content)
    trimmedGameUpdateUtils = true
    addNote('core/game/GameUpdateUtils.ts', 'dropped applyStateUpdate and its client/render/types PlayerState import - no in-closure caller uses it')

    // Dropping that import can newly orphan client/render/types/* - recompute once more.
    const { files: reClosure } = computeClosure(destSrc, 'core/GameRunner.ts')
    let rePruned = 0
    for (const file of walkTsFiles(destSrc)) {
      const rel = path.relative(destSrc, file).split(path.sep).join('/')
      if (!reClosure.has(rel)) {
        fs.unlinkSync(file)
        rePruned++
      }
    }
    pruneEmptyDirs(destSrc)
    if (rePruned) console.log(`  pruned ${rePruned} more file(s) orphaned by dropping applyStateUpdate; ${reClosure.size} remain`)
    trimmedClosure.clear()
    for (const f of reClosure) trimmedClosure.add(f)
  } else {
    trimmedGameUpdateUtils = false
    console.warn(`  NOTE: applyStateUpdate has ${otherCallers.length} real in-closure caller(s) - left it in place. Review manually:`, otherCallers.map((f) => path.relative(destSrc, f)))
  }
}
console.log(`  GameUpdateUtils trimmed: ${trimmedGameUpdateUtils}`)

// Sanity check: nothing outside the known-allowed client/* files should remain.
const remainingClientFiles = [...trimmedClosure].filter((f) => f.startsWith('client/'))
const unexpectedClient = remainingClientFiles.filter((f) => !['client/hud/NameBoxCalculator.ts', 'client/graphics/NameBoxCalculator.ts', 'client/render/gl/GraphicsOverrides.ts'].includes(f))
if (unexpectedClient.length) {
  console.warn('  WARNING: unexpected client/* files still in the closure - this commit likely needs a NEW trim this script doesn\'t know about:', unexpectedClient)
}

// ── 6. Headers, tsconfig, README ──────────────────────────────────────────

console.log('[6/8] Writing headers, tsconfig.json, README.md...')
for (const file of walkTsFiles(destSrc)) {
  const rel = path.relative(destSrc, file).split(path.sep).join('/')
  const content = fs.readFileSync(file, 'utf8')
  const fileNotes = notes.get(rel)
  const header = fileNotes
    ? `// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit ${commit}.\n` +
      `// Source: https://github.com/openfrontio/OpenFrontIO/blob/${commit}/src/${rel}\n` +
      `// Modified for this vendor build (auto-trimmed by scripts/vendor-engine.mjs) -\n` +
      `// ${fileNotes.join('; ')}.\n`
    : `// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit ${commit}.\n` +
      `// Source: https://github.com/openfrontio/OpenFrontIO/blob/${commit}/src/${rel}\n` +
      `// Unmodified copy - see src/vendor/openfront-core-${shortSha}/README.md.\n`
  fs.writeFileSync(file, header + content)
}

fs.writeFileSync(
  path.join(destDir, 'tsconfig.json'),
  JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2020',
        lib: ['ES2020', 'DOM', 'DOM.Iterable'],
        module: 'ESNext',
        moduleResolution: 'bundler',
        resolveJsonModule: true,
        isolatedModules: true,
        skipLibCheck: true,
        strict: true,
        composite: true,
        declaration: true,
        declarationMap: true,
        outDir: './dist',
        rootDir: './src',
        useDefineForClassFields: false,
        strictPropertyInitialization: false,
        noUnusedLocals: false,
        noUnusedParameters: false,
        types: ['node'],
      },
      include: ['src'],
    },
    null,
    2,
  ) + '\n',
)

fs.writeFileSync(
  path.join(destDir, 'README.md'),
  `# Vendored OpenFront core (headless simulation) - ${shortSha} pin\n\n` +
    `**Auto-generated by \`scripts/vendor-engine.mjs\`** - one of several vendored\n` +
    `engine trees, see \`src/vendor/openfront-core/README.md\`'s "Multiple vendored\n` +
    `commits" section for why, and \`src/lib/replaySimCore.ts\`'s\n` +
    `\`KNOWN_ENGINE_COMMITS\` / \`loadCreateGameRunner\` for the registry.\n\n` +
    `- Source: https://github.com/openfrontio/OpenFrontIO (AGPL-3.0-or-later)\n` +
    `- Pinned commit: \`${commit}\`\n` +
    `- Reachable closure from GameRunner.ts: ${trimmedClosure.size} files (${rawClosure.size} before trimming).\n` +
    `- Every vendored \`.ts\` file has a top-of-file comment with its exact upstream\n` +
    `  path and whether it's an unmodified copy or was trimmed for this build.\n\n` +
    `## What this script trimmed automatically\n\n` +
    `- Union-type arms (\`Xxx | XxxView\`) + their \`client/view\` imports: ${trimmedUnionCount} file(s).\n` +
    `- \`renderNumber\`/\`renderTroops\` repointed off \`client/Utils.ts\`: ${trimmedRenderNumberCount} file(s).\n` +
    `- \`resources/QuickChat.json\` path-alias import repointed: ${trimmedQuickChatCount} file(s).\n` +
    `- \`GameUpdateUtils.ts\`'s \`applyStateUpdate\`: ${trimmedGameUpdateUtils === true ? 'dropped (no in-closure caller)' : trimmedGameUpdateUtils === false ? 'KEPT - found an in-closure caller, review needed' : 'not present at this commit'}.\n` +
    (unexpectedClient.length
      ? `\n**Needs manual review**: unexpected client/* files remained reachable after trimming (${unexpectedClient.join(', ')}) - this commit likely introduced a new pattern this script doesn't know how to trim yet.\n`
      : '') +
    `\nSee \`src/vendor/openfront-core/README.md\` for the general "Why vendored" /\n` +
    `"Why this specific commit" background - unchanged across every pin.\n`,
)

// ── 7. Register the commit in replaySimCore.ts and root tsconfig.json ────

console.log('[7/8] Registering the commit in replaySimCore.ts and tsconfig.json...')
const coreFile = path.join(ROOT, 'src/lib/replaySimCore.ts')
let coreContent = fs.readFileSync(coreFile, 'utf8')
if (coreContent.includes(commit)) {
  console.log('  already registered, skipping')
} else {
  coreContent = coreContent.replace(
    /export const KNOWN_ENGINE_COMMITS = \[([\s\S]*?)\] as const/,
    (m, inner) => `export const KNOWN_ENGINE_COMMITS = [${inner}  '${commit}',\n] as const`,
  )
  coreContent = coreContent.replace(
    /(async function loadCreateGameRunner\(commit: EngineCommit\) \{\s*\n\s*switch \(commit\) \{[\s\S]*?)(\n\s*\}\s*\n\})/,
    (m, body, closing) =>
      `${body}\n    case '${commit}':\n      return (await import('../vendor/openfront-core-${shortSha}/src/core/GameRunner')).createGameRunner${closing}`,
  )
  fs.writeFileSync(coreFile, coreContent)
}

const tsconfigFile = path.join(ROOT, 'tsconfig.json')
const tsconfig = JSON.parse(fs.readFileSync(tsconfigFile, 'utf8'))
const refPath = `./src/vendor/openfront-core-${shortSha}`
if (!tsconfig.references.some((r) => r.path === refPath)) {
  tsconfig.references.push({ path: refPath })
  fs.writeFileSync(tsconfigFile, JSON.stringify(tsconfig, null, 2) + '\n')
}

// ── 8. Verify ──────────────────────────────────────────────────────────────

console.log('[8/8] Running tsc -b to verify...')
try {
  execSync('npx tsc -b', { cwd: ROOT, stdio: 'pipe' })
  console.log(`\nDone. Vendored ${commit} into ${path.relative(ROOT, destDir)} and it typechecks cleanly.`)
} catch (err) {
  console.error((err.stdout ?? '').toString())
  console.error((err.stderr ?? '').toString())
  console.error(
    `\ntsc -b failed. This commit likely introduced something the automated trims don't cover yet - ` +
      `read the errors above, fix ${path.relative(ROOT, destDir)} by hand (same way earlier commits' ` +
      `edge cases were handled), then re-run tsc -b to confirm.`,
  )
  process.exit(1)
}
