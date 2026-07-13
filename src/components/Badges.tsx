import type { Badge, BadgeTier } from '../lib/badges'

const TIER_COLOR: Record<BadgeTier, string> = {
  bronze: '#cd7f32',
  silver: '#c0c0c0',
  gold: '#f2c14e',
  diamond: '#7fe3f0',
}

function StarIcon({ color, className = 'h-5 w-5' }: { color: string; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={color} stroke="rgba(0,0,0,0.3)" strokeWidth="0.5">
      <path d="m12 2 2.9 6.26L22 9.27l-5 4.87L18.18 22 12 18.27 5.82 22 7 14.14l-5-4.87 7.1-1.01z" />
    </svg>
  )
}

function ShipIcon({ color, className = 'h-5 w-5' }: { color: string; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={color} stroke="rgba(0,0,0,0.3)" strokeWidth="0.4">
      <path d="M12 2 13 3v5h4l-1.5 3H13v3.2l6-1.8-2.2 5.1A5 5 0 0 1 12.2 22H12a7 7 0 0 1-4.8-2.2L4 14l6 1.8V11H8.5L7 8h4V3z" />
    </svg>
  )
}

export function BadgeIcon({ badge, className }: { badge: Badge; className?: string }) {
  const color = badge.tier ? TIER_COLOR[badge.tier] : '#5b5570'
  if (badge.kind === 'star') return <StarIcon color={badge.earned ? color : '#3a3550'} className={className} />
  if (badge.kind === 'ship') return <ShipIcon color={badge.earned ? color : '#3a3550'} className={className} />
  return <span className={className}>{badge.icon}</span>
}

/** Compact earned-only badges (for the roster / overview). */
export function BadgeStrip({ badges }: { badges: Badge[] }) {
  const earned = badges.filter((b) => b.earned)
  if (earned.length === 0) return null
  return (
    <span className="inline-flex items-center gap-1 align-middle">
      {earned.map((b) => (
        <span
          key={b.id}
          title={`${b.name} — ${b.desc}`}
          className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-base-800/80 text-sm"
        >
          <BadgeIcon badge={b} className="h-4 w-4" />
        </span>
      ))}
    </span>
  )
}

/** Full badge board (for the profile): earned in colour, others greyed. */
export function BadgeBoard({ badges }: { badges: Badge[] }) {
  const groups: { key: Badge['group']; label: string }[] = [
    { key: 'rank', label: 'Rank & Records' },
    { key: 'monthly', label: 'Monthly (this month)' },
    { key: 'milestone', label: 'Milestones (permanent)' },
  ]
  return (
    <div className="space-y-5">
      {groups.map((g) => {
        const items = badges.filter((b) => b.group === g.key)
        return (
          <div key={g.key}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">{g.label}</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {items.map((b) => (
                <div
                  key={b.id}
                  title={b.desc}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
                    b.earned ? 'border-gold/30 bg-gold/5' : 'border-base-700 bg-base-850/40 opacity-55'
                  }`}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-base-800 text-lg">
                    <BadgeIcon badge={b} className="h-6 w-6" />
                  </span>
                  <div className="min-w-0">
                    <p className={`truncate text-sm font-semibold ${b.earned ? 'text-white' : 'text-slate-400'}`}>
                      {b.name}
                      {b.tier && b.earned && <span className="ml-1 text-xs capitalize text-slate-400">{b.tier}</span>}
                    </p>
                    <p className="truncate text-[11px] text-slate-500">{b.earned ? 'Earned' : 'Locked'}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
