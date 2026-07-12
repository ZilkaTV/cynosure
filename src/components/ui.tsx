import type { ReactNode } from 'react'

export function SectionHeading({
  eyebrow,
  title,
  action,
}: {
  eyebrow?: string
  title: string
  action?: ReactNode
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && (
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-gold">{eyebrow}</p>
        )}
        <h2 className="font-display text-2xl font-bold text-white md:text-3xl">{title}</h2>
      </div>
      {action}
    </div>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`panel p-5 ${className}`}>{children}</div>
}

export function StatCard({
  label,
  value,
  sub,
  accent = 'purple',
}: {
  label: string
  value: ReactNode
  sub?: string
  accent?: 'purple' | 'gold' | 'plain'
}) {
  const valueCls =
    accent === 'gold' ? 'text-gold-light' : accent === 'purple' ? 'text-accent-light' : 'text-white'
  return (
    <div className="panel px-5 py-4">
      <p className="mb-1 text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`font-display text-2xl font-bold ${valueCls}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  )
}

/** Green/amber/grey dot summarising how active a member is (games in 30 days). */
export function ActivityDot({ games }: { games: number }) {
  const { cls, label } =
    games >= 10
      ? { cls: 'bg-signal-green', label: `Very active · ${games} games / 30d` }
      : games >= 3
        ? { cls: 'bg-gold', label: `Active · ${games} games / 30d` }
        : games >= 1
          ? { cls: 'bg-signal-blue', label: `Light · ${games} games / 30d` }
          : { cls: 'bg-base-500', label: 'Inactive · no CYN games in 30d' }
  return (
    <span className="inline-flex items-center gap-2" title={label}>
      <span className={`h-2.5 w-2.5 rounded-full ${cls} ${games >= 10 ? 'animate-pulse' : ''}`} />
    </span>
  )
}

/** A +/- elo delta, coloured. */
export function EloDelta({ delta }: { delta: number | null }) {
  if (delta == null) return <span className="text-slate-600">—</span>
  if (delta === 0) return <span className="text-slate-500">±0</span>
  const up = delta > 0
  return (
    <span className={up ? 'text-signal-green' : 'text-signal-red'}>
      {up ? '+' : ''}
      {delta}
    </span>
  )
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-400">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-base-600 border-t-accent" />
      {label && <p className="text-sm">{label}</p>}
    </div>
  )
}
