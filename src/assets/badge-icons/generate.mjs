import fs from 'node:fs'
import path from 'node:path'

const dir = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1')
const order = [
  'trophy', 'medal', 'crown', 'flame', 'bell', 'bow', 'bolt', 'pickaxe',
  'anchor', 'blast', 'wrench', 'flag', 'chatBubble', 'heart', 'handshake',
  'star', 'ship',
]

function componentName(key) {
  return key[0].toUpperCase() + key.slice(1) + 'Icon'
}

const parts = [
  `// Auto-generated from src/assets/badge-icons/*.svg (see that folder's README) -`,
  `// do not hand-edit; re-run generate.mjs there if a source icon changes.`,
  `import type { SVGProps } from 'react'`,
  '',
]

for (const key of order) {
  const svg = fs.readFileSync(path.join(dir, `${key}.svg`), 'utf8')
  const viewBoxMatch = svg.match(/viewBox="([^"]+)"/)
  const dMatch = svg.match(/<path fill="currentColor" d="([^"]+)"/)
  if (!viewBoxMatch || !dMatch) throw new Error(`Could not parse ${key}.svg`)
  parts.push(
    `export function ${componentName(key)}(props: SVGProps<SVGSVGElement>) {`,
    `  return (`,
    `    <svg viewBox="${viewBoxMatch[1]}" fill="currentColor" xmlns="http://www.w3.org/2000/svg" {...props}>`,
    `      <path d="${dMatch[1]}" />`,
    `    </svg>`,
    `  )`,
    `}`,
    '',
  )
}

const outPath = path.join(dir, '..', '..', 'components', 'BadgeIcons.tsx')
fs.writeFileSync(outPath, parts.join('\n'))
console.log('wrote', outPath)
