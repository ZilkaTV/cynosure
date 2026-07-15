// ── Emoji ────────────────────────────────────────────────────────────────────
// Renders real, colourful emoji as images via Twemoji (the same open-source
// emoji set Twitter/Discord use), so every badge/icon looks identical and
// colourful on every device - instead of relying on the browser's own emoji
// font, which is what rendered inconsistently ("WhatsApp-style" on some
// systems, invisible on others) before.

import { flagEmoji, countryName } from '../lib/countries'

const VARIATION_SELECTOR_16 = 0xfe0f

function toCodepoints(char: string): string {
  // Twemoji's SVG filenames drop the U+FE0F "emoji presentation" variation
  // selector for basically every character we use (⛏️, 🛠️, ⚔️, 🛡️, 🗺️, 🎖️
  // all 404 with it in the filename, 200 without) - so strip it before joining.
  return Array.from(char)
    .map((c) => c.codePointAt(0)!)
    .filter((cp) => cp !== VARIATION_SELECTOR_16)
    .map((cp) => cp.toString(16))
    .join('-')
}

export function Emoji({ char, className = 'h-4 w-4', label }: { char: string; className?: string; label?: string }) {
  const cp = toCodepoints(char)
  return (
    <img
      src={`https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/svg/${cp}.svg`}
      alt={label ?? char}
      title={label}
      className={`inline-block select-none align-middle ${className}`}
      draggable={false}
    />
  )
}

// Named shortcuts for the emoji used across the site, so call sites read
// clearly (e.g. <BadgeEmoji.trophy />) instead of passing raw unicode around.
export const EMOJI = {
  trophy: '🏆',
  medal: '🎖️',
  crown: '👑',
  flame: '🔥',
  bell: '🔔',
  bow: '🏹',
  bolt: '⚡',
  pickaxe: '⛏️',
  anchor: '⚓',
  blast: '💥',
  wrench: '🛠️',
  flag: '🏁',
  gold: '🥇',
  silver: '🥈',
  bronze: '🥉',
  sword: '⚔️',
  shield: '🛡️',
  coin: '🪙',
  skull: '💀',
  map: '🗺️',
  star: '⭐',
  ship: '⛵',
  cross: '✝️',
} as const

/** A member's nationality flag (ISO alpha-2 code), for showing next to their name in tables. */
export function Flag({ code, className = 'h-3.5 w-5' }: { code?: string; className?: string }) {
  if (!code) return null
  return <Emoji char={flagEmoji(code)} className={className} label={countryName(code)} />
}

/** Rank medal for #1/#2/#3 leaderboard rows (gold/silver/bronze emoji), plain number after. */
export function RankMedal({ rank, className = 'h-4 w-4' }: { rank: number; className?: string }) {
  if (rank > 3) return <span className="tabular-nums text-slate-500">#{rank}</span>
  const char = rank === 1 ? EMOJI.gold : rank === 2 ? EMOJI.silver : EMOJI.bronze
  return <Emoji char={char} className={className} label={`#${rank}`} />
}
