#!/usr/bin/env node
// Vendors one OpenFrontIO engine commit that uses the "packages/" layout (OpenFront v0.35 and later), where the
// headless game engine no longer lives in src/core but is split over workspace packages:
//
//   packages/engine      (the game itself: GameRunner, executions, game state)
//   packages/engine-api  (types, schemas, map file shapes)
//   packages/engine-lib  (shared helpers: PseudoRandom, Util, terrain map loading)
//   packages/zbin        (binary encoding)
//   resources/*.json     (two JSON files reached through the `resources/` path alias)
//
// Older commits (src/core layout) are vendored by scripts/vendor-engine.mjs, which hands over to this script when it
// finds packages/engine/src/GameRunner.ts at the commit.
//
// Result: src/vendor/openfront-core-<shortsha>/src/core/... - the packages are FLATTENED into one `core/` folder (the
// file names do not collide, the script stops if they ever do) and every `@openfront/<package>/...` import is rewritten
// to a relative path, so the tree looks like the older ones and `core/GameRunner` stays the entry point. The only
// difference the replay code has to know about is the way the engine is started: the new createGameRunner gets the
// map files (MapFiles) instead of a map loader - see PACKAGE_LAYOUT_COMMITS in src/lib/replaySimCore.ts.
//
// Usage: node scripts/vendor-engine-packages.mjs <full 40-char commit sha>

import { execFileSync, execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const CACHE_DIR = path.join(ROOT, '.vendor-cache', 'openfront-src')
const REPO_URL = 'https://github.com/openfrontio/OpenFrontIO.git'

// package name -> [source dir inside the repo, folder inside the vendored core/ ('' = core/ itself)]
const PACKAGES = {
  '@openfront/engine': ['packages/engine/src', ''],
  '@openfront/engine-api': ['packages/engine-api/src', ''],
  '@openfront/engine-lib': ['packages/engine-lib/src', ''],
  '@openfront/shared': ['packages/shared/src', ''],
  '@openfront/zbin': ['packages/zbin/src', 'zbin/'],
}
const ENTRY = 'packages/engine/src/GameRunner.ts'

const commit = process.argv[2]
if (!commit || !/^[0-9a-f]{40}$/i.test(commit)) {
  console.error('Usage: node scripts/vendor-engine-packages.mjs <full 40-char commit sha>')
  process.exit(1)
}
const shortSha = commit.slice(0, 7)
const destDir = path.join(ROOT, 'src', 'vendor', `openfront-core-${shortSha}`)
const destCore = path.join(destDir, 'src', 'core')
if (fs.existsSync(destDir)) {
  console.error(`${destDir} already exists - remove it first if you want to re-vendor this commit.`)
  process.exit(1)
}

const sh = (cmd) => execSync(cmd, { stdio: ['ignore', 'pipe', 'inherit'], cwd: ROOT }).toString()

// ── 1. Clone / checkout ──────────────────────────────────────────────────
console.log(`[1/6] Preparing OpenFrontIO clone at ${commit}...`)
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(path.dirname(CACHE_DIR), { recursive: true })
  sh(`git clone --quiet ${REPO_URL} "${CACHE_DIR}"`)
} else {
  try {
    sh(`git -C "${CACHE_DIR}" fetch --quiet origin`)
  } catch {
    // A full fetch can fail on a branch name clash while the objects still arrive; ask for the commit itself as well.
    try {
      sh(`git -C "${CACHE_DIR}" fetch --quiet origin ${commit}`)
    } catch {
      console.warn('  fetch failed (offline?) - trying with whatever is already cached')
    }
  }
}
sh(`git -C "${CACHE_DIR}" checkout --quiet ${commit}`)
if (!fs.existsSync(path.join(CACHE_DIR, ENTRY))) {
  console.error(`${ENTRY} does not exist at ${commit} - this commit does not use the packages/ layout (use scripts/vendor-engine.mjs).`)
  process.exit(1)
}

// ── 2. Closure from GameRunner.ts ────────────────────────────────────────
function resolveFile(base) {
  for (const c of [base, base + '.ts', base + '.tsx', base + '.json', path.join(base, 'index.ts')]) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c
  }
  return null
}
/** Absolute file a specifier points to inside the repo, or null (a bare npm package such as zod). */
function resolveSpec(fromFile, spec) {
  if (spec.startsWith('.')) return resolveFile(path.join(path.dirname(fromFile), spec))
  for (const [name, [dir]] of Object.entries(PACKAGES)) {
    if (spec === name) return resolveFile(path.join(CACHE_DIR, dir, 'index'))
    if (spec.startsWith(name + '/')) return resolveFile(path.join(CACHE_DIR, dir, spec.slice(name.length + 1)))
  }
  if (spec.startsWith('resources/')) return resolveFile(path.join(CACHE_DIR, spec))
  return null
}
const SPEC_RE = /(\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)(['"])([^'"\n]+)\2/g

console.log(`[2/6] Computing the closure from ${ENTRY}...`)
const closure = new Set()
const bare = new Set()
const unresolved = []
const queue = [path.join(CACHE_DIR, ENTRY)]
while (queue.length) {
  const file = queue.shift()
  if (closure.has(file)) continue
  closure.add(file)
  if (file.endsWith('.json')) continue
  const content = fs.readFileSync(file, 'utf8')
  for (const m of content.matchAll(SPEC_RE)) {
    const spec = m[3]
    const target = resolveSpec(file, spec)
    if (target) queue.push(target)
    else if (spec.startsWith('.') || spec.startsWith('@openfront/') || spec.startsWith('resources/')) unresolved.push(`${path.relative(CACHE_DIR, file)} -> ${spec}`)
    else bare.add(spec)
  }
}
if (unresolved.length) {
  console.error('Unresolved imports while walking the closure:', unresolved)
  process.exit(1)
}
console.log(`  ${closure.size} files, npm packages used: ${[...bare].join(', ') || '(none)'}`)
const clientFiles = [...closure].map((f) => path.relative(CACHE_DIR, f).split(path.sep).join('/')).filter((r) => r.startsWith('src/'))
if (clientFiles.length) {
  console.error('The engine closure reaches into the client (src/): ' + clientFiles.slice(0, 10).join(', ') + ' - this commit needs a human look.')
  process.exit(1)
}

// ── 3. Where every file goes ─────────────────────────────────────────────
function destFileOf(srcAbs) {
  const rel = path.relative(CACHE_DIR, srcAbs).split(path.sep).join('/')
  if (rel.startsWith('resources/')) return path.join(destDir, rel)
  for (const [dir, sub] of Object.values(PACKAGES)) {
    if (rel.startsWith(dir + '/')) return path.join(destCore, sub + rel.slice(dir.length + 1))
  }
  throw new Error(`no destination for ${rel}`)
}
const destOf = new Map()
const taken = new Map()
for (const f of closure) {
  const d = destFileOf(f)
  if (taken.has(d)) {
    console.error(`Two files would land on the same path: ${path.relative(CACHE_DIR, taken.get(d))} and ${path.relative(CACHE_DIR, f)} (${path.relative(ROOT, d)}). Needs a human look.`)
    process.exit(1)
  }
  taken.set(d, f)
  destOf.set(f, d)
}

// ── 4. Copy, rewrite the imports, add headers ────────────────────────────
console.log('[3/6] Copying files and rewriting imports...')
let rewritten = 0
for (const [src, dest] of destOf) {
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  const raw = fs.readFileSync(src, 'utf8').replace(/\r\n/g, '\n')
  if (src.endsWith('.json')) {
    fs.writeFileSync(dest, raw)
    continue
  }
  let changed = false
  const body = raw.replace(SPEC_RE, (whole, lead, quote, spec) => {
    const target = resolveSpec(src, spec)
    if (!target) return whole
    let rel = path.relative(path.dirname(dest), destOf.get(target)).split(path.sep).join('/')
    if (!rel.startsWith('.')) rel = './' + rel
    rel = rel.replace(/\.tsx?$/, '')
    if (rel === spec) return whole
    changed = true
    return `${lead}${quote}${rel}${quote}`
  })
  if (changed) rewritten++
  const upstream = path.relative(CACHE_DIR, src).split(path.sep).join('/')
  const header =
    `// Vendored from openfrontio/OpenFrontIO (AGPL-3.0-or-later), commit ${commit}.\n` +
    `// Source: https://github.com/openfrontio/OpenFrontIO/blob/${commit}/${upstream}\n` +
    (changed
      ? `// Modified for this vendor build (scripts/vendor-engine-packages.mjs): workspace package imports (@openfront/*, resources/*) rewritten to relative paths.\n`
      : `// Unmodified copy - see src/vendor/openfront-core-${shortSha}/README.md.\n`)
  fs.writeFileSync(dest, header + body)
}
console.log(`  ${destOf.size} files copied, imports rewritten in ${rewritten}`)

// ── 5. tsconfig + README ─────────────────────────────────────────────────
console.log('[4/6] Writing tsconfig.json and README.md...')
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
  `# Vendored OpenFront core (headless simulation) - ${shortSha} pin (packages/ layout)\n\n` +
    `**Auto-generated by \`scripts/vendor-engine-packages.mjs\`** - one of several vendored engine trees, see\n` +
    `\`src/vendor/openfront-core/README.md\` for why they exist and \`src/lib/replaySimCore.ts\`\n` +
    `(\`KNOWN_ENGINE_COMMITS\`, \`loadCreateGameRunner\`, \`PACKAGE_LAYOUT_COMMITS\`) for the registry.\n\n` +
    `- Source: https://github.com/openfrontio/OpenFrontIO (AGPL-3.0-or-later)\n` +
    `- Pinned commit: \`${commit}\`\n` +
    `- Reachable closure from \`packages/engine/src/GameRunner.ts\`: ${closure.size} files.\n` +
    `- OpenFront split the engine into workspace packages (\`engine\`, \`engine-api\`, \`engine-lib\`, \`zbin\`). They are flattened into\n` +
    `  \`src/core/\` here and every \`@openfront/*\` import was rewritten to a relative path, so \`core/GameRunner\` is still the entry point.\n` +
    `- **Different from the older trees:** \`createGameRunner(gameStart, clientID, mapFiles, callBack)\` takes the loaded map files\n` +
    `  (\`MapFiles\`), not a map loader. The replay code adapts for it, see \`PACKAGE_LAYOUT_COMMITS\`.\n` +
    `- Every vendored \`.ts\` file starts with a comment naming its exact upstream path.\n`,
)

// ── 6. Register ──────────────────────────────────────────────────────────
console.log('[5/6] Registering the commit in replaySimCore.ts and tsconfig.json...')
const coreFile = path.join(ROOT, 'src/lib/replaySimCore.ts')
let core = fs.readFileSync(coreFile, 'utf8')
if (core.includes(`'${commit}'`)) {
  console.log('  already registered, skipping')
} else {
  const eol = core.includes('\r\n') ? '\r\n' : '\n'
  core = core.replace(/export const KNOWN_ENGINE_COMMITS = \[([\s\S]*?)\] as const/, (m, inner) => `export const KNOWN_ENGINE_COMMITS = [${inner}  '${commit}',${eol}] as const`)
  core = core.replace(/export const PACKAGE_LAYOUT_COMMITS = \[([\s\S]*?)\] as const/, (m, inner) => `export const PACKAGE_LAYOUT_COMMITS = [${inner}  '${commit}',${eol}] as const`)
  core = core.replace(
    /(async function loadCreateGameRunner\(commit: EngineCommit\) \{\s*\r?\n\s*switch \(commit\) \{[\s\S]*?)(\r?\n\s*\}\s*\r?\n\})/,
    (m, body, closing) => `${body}${eol}    case '${commit}':${eol}      return (await import('../vendor/openfront-core-${shortSha}/src/core/GameRunner')).createGameRunner${closing}`,
  )
  if (!core.includes(`'${commit}'`) || !/PACKAGE_LAYOUT_COMMITS = \[[\s\S]*?'[0-9a-f]{40}'/.test(core)) {
    console.error('Could not register the commit in replaySimCore.ts (KNOWN_ENGINE_COMMITS / PACKAGE_LAYOUT_COMMITS / loadCreateGameRunner) - check the file layout.')
    process.exit(1)
  }
  fs.writeFileSync(coreFile, core)
}
const tsconfigFile = path.join(ROOT, 'tsconfig.json')
const tsconfig = JSON.parse(fs.readFileSync(tsconfigFile, 'utf8'))
const refPath = `./src/vendor/openfront-core-${shortSha}`
if (!tsconfig.references.some((r) => r.path === refPath)) {
  tsconfig.references.push({ path: refPath })
  fs.writeFileSync(tsconfigFile, JSON.stringify(tsconfig, null, 2) + '\n')
}

// ── 7. Verify ────────────────────────────────────────────────────────────
console.log('[6/6] Running tsc -b on the new tree to verify...')
try {
  execFileSync('npx', ['tsc', '-b', path.relative(ROOT, destDir)], { cwd: ROOT, stdio: 'pipe', shell: process.platform === 'win32' })
  console.log(`\nDone. Vendored ${commit} into ${path.relative(ROOT, destDir)} and it typechecks cleanly.`)
} catch (err) {
  console.error((err.stdout ?? '').toString())
  console.error((err.stderr ?? '').toString())
  console.error(`\ntsc -b failed for ${path.relative(ROOT, destDir)} - read the errors above.`)
  process.exit(1)
}
