import { useEffect, useMemo, useState } from 'react'
import { Card, SectionHeading, StatCard, Spinner, relativeTime } from '../components/ui'
import { StatsShell } from '../components/StatsShell'
import GameDetailModal from '../components/GameDetailModal'
import { useLanguage } from '../i18n/LanguageContext'
import { supabase as db } from '../lib/supabase'
import { useQueueAlertSettings, testQueueAlert } from '../lib/queueNotify'

// The signed-in visitor's own account (GET /api/queue/me): named next to the in-game name when they played under another name.
interface MyAccount {
  k: string
  name: string
  boards: { '1v1'?: { rank: number; elo: number }; '2v2'?: { rank: number; elo: number } }
}

// One stored game (see scripts/collect-ranked-feed.mjs): display-ready players only. `r`/`e`/`id` exist only for
// players using the name of their own ranked account, everyone else carries at most a rank band `b`.
interface FeedPlayer {
  n: string
  t: string | null
  s: number
  w: boolean
  k?: string
  r?: number
  e?: number
  id?: string
  b?: string
  d?: number // Elo change (only for top-100 players using their own name); with `c` it is the total of the last c games
  c?: number
  /** Elo change worked out from the opponent's (1v1 is zero-sum), not measured for this player. */
  mirrored?: boolean
}
interface FeedMatch {
  game_id: string
  ladder: '1v1' | '2v2'
  ended_at: string
  duration_s: number | null
  map: string | null
  top_count: number
  players: FeedPlayer[]
}
type Ladder = 'all' | '1v1' | '2v2'

const REFRESH_MS = 30_000
const MAX_ELO_PER_GAME = 30
// Traffic light: distinct top-100 players who finished a game in the last 30 minutes.
const BUSY_FROM = 12
const MEDIUM_FROM = 5
const LIST_LIMIT = 60

/** In a 1v1 the winner gains exactly what the loser loses: fill in the missing side from the one that is known. */
function withMirroredElo(m: FeedMatch): FeedPlayer[] {
  // A single game cannot take points from a winner or give them to a loser: such a change belongs to another game.
  const hasWinner = m.players.some((p) => p.w)
  const players = m.players.map((p) => {
    if (p.d === undefined) return p
    // One game moves a rating by 30 at most (a sum over c games by 30 each).
    const tooBig = Math.abs(p.d) > MAX_ELO_PER_GAME * (p.c ?? 1)
    if (!hasWinner && !tooBig) return p
    if (p.c && !tooBig) return p
    if (tooBig || (p.w ? p.d < 0 : p.d > 0)) {
      const rest = { ...p }
      delete rest.d
      delete rest.mirrored
      return rest
    }
    return p
  })
  if (m.ladder !== '1v1' || players.length !== 2) return players
  const [a, b] = players
  if (a.d !== undefined && !a.c && b.d === undefined) return [a, { ...b, d: -a.d, mirrored: true }]
  if (b.d !== undefined && !b.c && a.d === undefined) return [{ ...a, d: -b.d, mirrored: true }, b]
  return players
}

/** A game that did not really take place: no winner or over before anybody could play (spawn phase alone is longer). */
export function isAbandoned(m: { duration_s: number | null; players: { w: boolean }[] }): boolean {
  return (m.duration_s ?? 0) < 45 || !m.players.some((p) => p.w)
}

function fmtDuration(s: number | null): string {
  if (!s) return '-'
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function PlayerChip({ p, mine, ladder }: { p: FeedPlayer; mine?: MyAccount | null; ladder?: '1v1' | '2v2' }) {
  // Only the visitor's own account is named - nobody else's other name is ever revealed here.
  const own = mine && p.k && p.k === mine.k && !p.id ? mine : null
  const ownBoard = own && ladder ? own.boards[ladder] : undefined
  const label = (
    <span className={p.w ? 'font-semibold text-white' : 'text-slate-300'}>
      {p.t ? <span className="text-slate-500">[{p.t}] </span> : null}
      {p.n}
      {own && <span className="ml-1 text-gold-light">({own.name})</span>}
    </span>
  )
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2">
      {p.id ? (
        <a href={`https://openfront.io/#modal=profile&publicID=${encodeURIComponent(p.id)}`} target="_blank" rel="noreferrer" className="hover:text-accent-light">
          {label}
        </a>
      ) : (
        label
      )}
      {p.r != null && (
        <span className="rounded bg-gold/15 px-1.5 py-0.5 text-[11px] font-bold text-gold-light">
          #{p.r}
          {p.e != null ? ` · ${p.e}` : ''}
        </span>
      )}
      {p.d !== undefined && (
        <span title={p.mirrored ? "Elo is zero-sum in 1v1: the opponent’s change, mirrored" : undefined} className={`rounded px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${p.d > 0 ? 'bg-emerald-500/15 text-emerald-300' : p.d < 0 ? 'bg-rose-500/15 text-rose-300' : 'bg-base-700 text-slate-400'}`}>
          {p.c ? 'Σ ' : p.mirrored ? '≈ ' : ''}
          {p.d > 0 ? '+' : ''}
          {p.d} Elo{p.c ? ` (${p.c})` : ''}
        </span>
      )}
      {own && ownBoard && p.r == null && (
        <span className="rounded bg-gold/15 px-1.5 py-0.5 text-[11px] font-bold text-gold-light">
          #{ownBoard.rank} · {ownBoard.elo}
        </span>
      )}
      {p.r == null && p.b && !(own && ownBoard) && <span className="rounded bg-base-700 px-1.5 py-0.5 text-[11px] font-medium text-slate-400">Top 100</span>}
    </span>
  )
}

export default function RankedQueue() {
  const { t } = useLanguage()
  const [ladder, setLadder] = useState<Ladder>('all')
  const [matches, setMatches] = useState<FeedMatch[] | null>(null)
  const [error, setError] = useState(false)
  const [openGame, setOpenGame] = useState<string | null>(null)
  const alert = useQueueAlertSettings()
  const [me, setMe] = useState<MyAccount | null>(null)
  useEffect(() => {
    let alive = true
    fetch('/api/queue/me', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (alive && j?.k) setMe(j as MyAccount)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])
  const [, setTick] = useState(0)
  const [loadedAt, setLoadedAt] = useState<number | null>(null)

  useEffect(() => {
    let alive = true
    async function load() {
      const since = new Date(Date.now() - 24 * 3600_000).toISOString()
      const { data, error: err } = await db.from('cyn_ranked_matches').select('*').gte('ended_at', since).order('ended_at', { ascending: false }).limit(1500)
      if (!alive) return
      if (err) setError(true)
      else {
        setError(false)
        setMatches((data ?? []) as FeedMatch[])
      }
      setTick((n) => n + 1)
      if (!err) setLoadedAt(Date.now())
    }
    void load()
    const timer = setInterval(() => document.visibilityState === 'visible' && void load(), REFRESH_MS)
    // Coming back to the tab (or to this monitor/window) refreshes at once instead of waiting for the next tick.
    const wake = () => document.visibilityState === 'visible' && void load()
    document.addEventListener('visibilitychange', wake)
    window.addEventListener('focus', wake)
    return () => {
      alive = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', wake)
      window.removeEventListener('focus', wake)
    }
  }, [])

  const shown = useMemo(() => (matches ?? []).filter((m) => ladder === 'all' || m.ladder === ladder), [matches, ladder])

  const activity = useMemo(() => {
    const now = Date.now()
    const count = (mins: number) => {
      const ids = new Set<string>()
      for (const m of shown) {
        if (now - Date.parse(m.ended_at) > mins * 60_000) continue
        if (isAbandoned(m)) continue
        for (const p of m.players) if (p.k) ids.add(p.k)
      }
      return ids.size
    }
    return { m5: count(5), m15: count(15), m30: count(30) }
  }, [shown])

  const level = activity.m30 >= BUSY_FROM ? 'high' : activity.m30 >= MEDIUM_FROM ? 'medium' : 'low'

  return (
    <StatsShell>
      <section className="space-y-6">
        <SectionHeading center eyebrow={t.queue.eyebrow} title={t.queue.title} />
        <p className="mx-auto max-w-2xl text-center text-xs text-slate-400 sm:text-sm">{t.queue.intro}</p>
        {loadedAt && <p className="text-center text-[11px] tabular-nums text-slate-500">↻ {new Date(loadedAt).toLocaleTimeString()}</p>}

        <div className="flex justify-center gap-2">
          {(['all', '1v1', '2v2'] as Ladder[]).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLadder(l)}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${ladder === l ? (l === '2v2' ? 'bg-teal-600 text-white' : 'bg-accent text-white') : 'bg-base-800 text-slate-400 hover:bg-base-700 hover:text-slate-200'}`}
            >
              {l === 'all' ? t.queue.all : l}
            </button>
          ))}
        </div>

        <Card className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-x-4 gap-y-2 !py-3">
          <span className="text-sm font-medium text-slate-200">🔔 {t.queue.alertTitle}</span>
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            {(['1v1', '2v2'] as const).map((l) => {
              const on = l === '1v1' ? alert.on1v1 : alert.on2v2
              return (
                <button
                  key={l}
                  type="button"
                  role="switch"
                  aria-checked={on}
                  onClick={() => alert.toggle(l, !on)}
                  className="flex items-center gap-2 text-sm text-slate-200"
                >
                  <span className={`relative inline-block h-6 w-11 rounded-full transition-colors ${on ? (l === '1v1' ? 'bg-violet-500' : 'bg-teal-500') : 'bg-base-700'}`}>
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
                  </span>
                  <span className="font-semibold">{l}</span>
                  <span className={`w-7 text-left text-xs font-bold ${on ? 'text-emerald-300' : 'text-slate-500'}`}>{on ? t.queue.on : t.queue.off}</span>
                </button>
              )
            })}
          </div>
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-400">
            <input type="checkbox" checked={alert.sound} onChange={(e) => alert.setSound(e.target.checked)} className="accent-[#8b5cf6]" />
            {t.queue.alertSound}
          </label>
          <button type="button" onClick={testQueueAlert} className="rounded-md bg-base-800 px-3 py-1 text-xs font-medium text-slate-300 hover:bg-base-700">
            {t.queue.alertTest}
          </button>
          {alert.permission === 'denied' && (alert.on1v1 || alert.on2v2) && <p className="w-full text-center text-xs text-amber-300">{t.queue.permissionDenied}</p>}
          <p className="w-full text-center text-[11px] text-slate-500">{t.queue.alertHint}</p>
        </Card>

        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <StatCard label={t.queue.active5} value={String(activity.m5)} accent="purple" />
          <StatCard label={t.queue.active15} value={String(activity.m15)} accent="purple" />
          <StatCard label={t.queue.active30} value={String(activity.m30)} accent="gold" />
        </div>

        <Card className="flex items-center gap-4 !py-4">
          <div className="flex shrink-0 flex-col gap-1.5 rounded-xl bg-base-950 p-2" role="img" aria-label={t.queue.levels[level]}>
            {(['low', 'medium', 'high'] as const).map((l) => (
              <span
                key={l}
                className={`block h-5 w-5 rounded-full transition-all ${
                  l === 'low' ? (level === l ? 'bg-red-500 shadow-[0_0_12px_2px_rgba(239,68,68,0.7)]' : 'bg-red-950') : l === 'medium' ? (level === l ? 'bg-amber-400 shadow-[0_0_12px_2px_rgba(251,191,36,0.7)]' : 'bg-amber-950') : level === l ? 'bg-emerald-400 shadow-[0_0_12px_2px_rgba(52,211,153,0.7)]' : 'bg-emerald-950'
                }`}
              />
            ))}
          </div>
          <div className="min-w-0">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{t.queue.level}</div>
            <div className="font-display text-xl font-bold text-white">{t.queue.levels[level]}</div>
            <p className="mt-1 text-xs text-slate-400">{t.queue.lampRule(MEDIUM_FROM, BUSY_FROM)}</p>
          </div>
        </Card>

        <div>
          <h3 className="mb-3 font-display text-base font-bold text-white">{t.queue.recent}</h3>
          {error && <p className="text-sm text-slate-400">{t.queue.loadError}</p>}
          {!matches && !error && <Spinner />}
          {matches && shown.length === 0 && <p className="text-sm text-slate-400">{t.queue.empty}</p>}
          <div className="space-y-2">
            {shown.slice(0, LIST_LIMIT).map((m) => {
              const players = withMirroredElo(m)
              const sides = [...new Set(players.map((p) => p.s))].sort((a, b) => a - b)
              const abandoned = isAbandoned(m)
              return (
                <div
                  key={m.game_id}
                  role="button"
                  tabIndex={0}
                  title={t.queue.openGame}
                  onClick={(e) => {
                    // A click on the profile link of a player must keep opening the profile, not the report.
                    if ((e.target as HTMLElement).closest('a')) return
                    setOpenGame(m.game_id)
                  }}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setOpenGame(m.game_id))}
                  className={`panel flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-2 border-l-4 px-4 py-3 text-sm transition-colors hover:bg-base-800/60 ${abandoned ? 'border-l-slate-600 opacity-60' : m.ladder === '1v1' ? 'border-l-violet-500' : 'border-l-teal-500'}`}
                >
                  <div className="w-24 shrink-0">
                    <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${abandoned ? 'bg-slate-600/40 text-slate-300' : m.ladder === '1v1' ? 'bg-violet-500/25 text-violet-200' : 'bg-teal-500/25 text-teal-200'}`}>{m.ladder}</span>
                    {abandoned && (
                      <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400" title={m.ladder === '2v2' ? t.queue.abandoned2v2 : t.queue.abandoned1v1}>
                        {t.queue.abandoned}
                      </div>
                    )}
                    <div className="mt-1 text-xs text-slate-500">{relativeTime(Date.parse(m.ended_at), t)}</div>
                  </div>
                  <div className="w-32 shrink-0 text-xs text-slate-400">
                    <div className="text-slate-200">{(m.map ?? '-').split(' · ')[0]}</div>
                    {m.map?.includes(' · ') && (
                      <span className={`mt-0.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${m.map.endsWith('Compact') ? 'bg-amber-500/20 text-amber-300' : 'bg-base-700 text-slate-300'}`}>
                        {m.map.endsWith('Compact') ? t.queue.mapCompact : t.queue.mapNormal}
                      </span>
                    )}
                    <div>{fmtDuration(m.duration_s)}</div>
                  </div>
                  <div className="flex min-w-0 basis-full flex-col gap-2 sm:flex-1 sm:basis-0 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-1">
                    {sides.map((side, i) => {
                      const team = players.filter((p) => p.s === side)
                      const won = team.some((p) => p.w)
                      return (
                        <div key={side} className="flex w-full items-center gap-3 sm:w-auto">
                          {i > 0 && <span className="w-5 shrink-0 text-center text-xs text-slate-600">vs</span>}
                          <div className={`flex min-w-0 flex-1 flex-col gap-0.5 rounded-lg border px-2.5 py-1.5 sm:flex-none ${won && !abandoned ? 'border-gold/50 bg-gold/5' : 'border-base-700'}`}>
                            {won && !abandoned && <span className="text-[10px] font-bold uppercase tracking-wide text-gold-light">✓ {t.queue.winner}</span>}
                            {team.map((p, j) => (
                              <PlayerChip key={j} p={p} mine={me} ladder={m.ladder} />
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <span className="ml-auto shrink-0 font-mono text-xs text-slate-500 sm:pl-4">{m.game_id}</span>
                </div>
              )
            })}
          </div>
        </div>

        <p className="text-center text-xs text-slate-500">{t.queue.eloNote}</p>
        <p className="text-center text-xs text-slate-500">{t.queue.privacyNote}</p>
        <GameDetailModal gameId={openGame} onClose={() => setOpenGame(null)} />
      </section>
    </StatsShell>
  )
}
