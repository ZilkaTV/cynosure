import { useEffect, useState, type ReactNode } from 'react'

/** Ticking "1h 23m" / "23m 05s" countdown to a target timestamp, or null once it's passed. */
export function useCountdown(targetMs: number | null): string | null {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (targetMs == null) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [targetMs])

  if (targetMs == null) return null
  const remaining = targetMs - now
  if (remaining <= 0) return null
  const totalSec = Math.floor(remaining / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`
  return `${s}s`
}

export function SectionHeading({
  eyebrow,
  title,
  action,
  center = false,
}: {
  eyebrow?: string
  title: string
  action?: ReactNode
  center?: boolean
}) {
  if (center) {
    return (
      <div className="mb-6 text-center">
        {eyebrow && (
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-gold">{eyebrow}</p>
        )}
        <h2 className="font-display text-2xl font-bold text-white md:text-3xl">{title}</h2>
        {action && <div className="mt-3 flex justify-center">{action}</div>}
      </div>
    )
  }
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
  className = '',
}: {
  label: string
  value: ReactNode
  sub?: string
  accent?: 'purple' | 'gold' | 'plain'
  className?: string
}) {
  const valueCls =
    accent === 'gold' ? 'text-gold-light' : accent === 'purple' ? 'text-accent-light' : 'text-white'
  return (
    <div className={`panel px-5 py-4 text-center sm:text-left ${className}`}>
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
  if (delta == null) return <span className="text-slate-600">-</span>
  if (delta === 0) return <span className="text-slate-500">±0</span>
  const up = delta > 0
  return (
    <span className={up ? 'text-signal-green' : 'text-signal-red'}>
      {up ? '+' : ''}
      {delta}
    </span>
  )
}

/** Small green/red "+N" shown next to a stat right after a manual refresh. */
export function RefreshDelta({ value }: { value: number | undefined }) {
  if (!value) return null
  return (
    <span className={`ml-1 text-xs font-bold ${value > 0 ? 'text-signal-green' : 'text-signal-red'}`}>
      {value > 0 ? '+' : ''}
      {value}
    </span>
  )
}

/** "5 minutes ago" style relative time. */
export function relativeTime(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`
  const d = Math.floor(h / 24)
  return `${d} day${d === 1 ? '' : 's'} ago`
}

export function LastUpdated({
  ts,
  onRefresh,
  refreshing,
}: {
  ts: number | null
  onRefresh: () => void
  refreshing: boolean
}) {
  return (
    <div className="flex items-center justify-center gap-3 text-xs text-slate-500">
      <span>{ts ? `Updated ${relativeTime(ts)}` : 'Loading live data…'}</span>
      <button
        onClick={onRefresh}
        disabled={refreshing}
        className="inline-flex items-center gap-1.5 rounded-md border border-base-600 px-2 py-1 font-medium text-slate-300 transition-colors hover:border-accent hover:text-white disabled:opacity-50"
      >
        <svg className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M23 4v6h-6M1 20v-6h6" />
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
        </svg>
        {refreshing ? 'Refreshing…' : 'Refresh'}
      </button>
    </div>
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
