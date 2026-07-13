// ── Levels ───────────────────────────────────────────────────────────────────
// XP -> level 1-99. The curve (xp = level^2.5) is deliberately front-loaded:
// early levels take a day or two, but the run to 99 takes years even at full
// daily-quest completion - see the calibration table below.
//
//   Level   XP needed   ~days at 80 XP/day (all 5 dailies every day)
//     5         56        <1
//    10        316         4
//    20      1,789        22
//    35      7,247        91
//    50     17,678       221
//    75     48,714       609
//    90     76,843       961
//    99     97,519     1,219  (~3.3 years)

export const MAX_LEVEL = 99

export function xpForLevel(level: number): number {
  return Math.round(Math.pow(level, 2.5))
}

export function levelFromXp(xp: number): number {
  let level = 1
  for (let l = MAX_LEVEL; l >= 1; l--) {
    if (xp >= xpForLevel(l)) {
      level = l
      break
    }
  }
  return level
}

export function xpProgress(xp: number): { level: number; into: number; span: number; next: number | null } {
  const level = levelFromXp(xp)
  if (level >= MAX_LEVEL) return { level, into: 0, span: 1, next: null }
  const cur = xpForLevel(level)
  const next = xpForLevel(level + 1)
  return { level, into: xp - cur, span: next - cur, next }
}

/** Named, upgradeable title tiers - the badge shown is always the highest one reached. */
export const LEVEL_TIERS: { level: number; title: string }[] = [
  { level: 1, title: 'CYN Starter' },
  { level: 5, title: 'CYN Recruit' },
  { level: 10, title: 'CYN Fighter' },
  { level: 20, title: 'CYN Veteran' },
  { level: 35, title: 'CYN Elite' },
  { level: 50, title: 'CYN Champion' },
  { level: 75, title: 'CYN Legend' },
  { level: 90, title: 'CYN Mythic' },
  { level: 99, title: 'CYN God' },
]

export function titleForLevel(level: number): string {
  let title = LEVEL_TIERS[0].title
  for (const t of LEVEL_TIERS) {
    if (level >= t.level) title = t.title
    else break
  }
  return title
}
