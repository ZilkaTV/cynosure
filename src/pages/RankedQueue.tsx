import { useEffect, useMemo, useState } from 'react'
import { Card, SectionHeading, StatCard, Spinner, relativeTime } from '../components/ui'
import { StatsShell } from '../components/StatsShell'
import GameDetailModal from '../components/GameDetailModal'
import { useLanguage } from '../i18n/LanguageContext'
import { supabase as db } from '../lib/supabase'
import { useQueueAlertSettings, type QueueAlertMode } from '../lib/queueNotify'

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
  d?: number // Elo change of this game (only known for top-100 players using their own name)
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

const REFRESH_MS = 60_000
const LIST_LIMIT = 60

function fmtDuration(s: number | null): string {
  if (!s) return '-'
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function PlayerChip({ p }: { p: FeedPlayer }) {
  const label = (
    <span className={p.w ? 'font-semibold text-white' : 'text-slate-300'}>
      {p.t ? <span className="text-slate-500">[{p.t}] </span> : null}
      {p.n}
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
        <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${p.d > 0 ? 'bg-emerald-500/15 text-emerald-300' : p.d < 0 ? 'bg-rose-500/15 text-rose-300' : 'bg-base-700 text-slate-400'}`}>
          {p.d > 0 ? '+' : ''}
          {p.d} Elo
        </span>
      )}
      {p.r == null && p.b && <span className="rounded bg-base-700 px-1.5 py-0.5 text-[11px] font-medium text-slate-400">{p.b}</span>}
    </span>
  )
}

export default function RankedQueue() {
  const { t } = useLanguage()
  const [ladder, setLadder] = useState<Ladder>('all')
  const [matches, setMatches] = useState<FeedMatch[] | null>(null)
  const [history, setHistory] = useState<{ ended_at: string; ladder: string }[]>([])
  const [error, setError] = useState(false)
  const [openGame, setOpenGame] = useState<string | null>(null)
  const alert = useQueueAlertSettings()
  const [, setTick] = useState(0)

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
    }
    void load()
    const timer = setInterval(() => document.visibilityState === 'visible' && void load(), REFRESH_MS)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [])

  // Three days of timestamps for the "best times" chart - loaded once.
  useEffect(() => {
    let alive = true
    const since = new Date(Date.now() - 3 * 86400_000).toISOString()
    db.from('cyn_ranked_matches')
      .select('ended_at, ladder')
      .gte('ended_at', since)
      .limit(5000)
      .then(({ data }: { data: { ended_at: string; ladder: string }[] | null }) => {
        if (alive) setHistory(data ?? [])
      })
    return () => {
      alive = false
    }
  }, [])

  const shown = useMemo(() => (matches ?? []).filter((m) => ladder === 'all' || m.ladder === ladder), [matches, ladder])

  const activity = useMemo(() => {
    const now = Date.now()
    const count = (mins: number) => {
      const ids = new Set<string>()
      for (const m of shown) {
        if (now - Date.parse(m.ended_at) > mins * 60_000) continue
        for (const p of m.players) if (p.k) ids.add(p.k)
      }
      return ids.size
    }
    return { m5: count(5), m15: count(15), m30: count(30) }
  }, [shown])

  const hours = useMemo(() => {
    const buckets = new Array(24).fill(0)
    for (const h of history) if (ladder === 'all' || h.ladder === ladder) buckets[new Date(h.ended_at).getHours()]++
    const max = Math.max(1, ...buckets)
    return { buckets, max }
  }, [history, ladder])

  const nowHour = new Date().getHours()
  const level = activity.m30 >= 12 ? 'high' : activity.m30 >= 5 ? 'medium' : 'low'

  return (
    <StatsShell>
      <section className="space-y-6">
        <SectionHeading center eyebrow={t.queue.eyebrow} title={t.queue.title} />
        <p className="mx-auto max-w-2xl text-center text-sm text-slate-400">{t.queue.intro}</p>

        <div className="flex justify-center gap-2">
          {(['all', '1v1', '2v2'] as Ladder[]).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLadder(l)}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${ladder === l ? 'bg-accent text-white' : 'bg-base-800 text-slate-400 hover:bg-base-700 hover:text-slate-200'}`}
            >
              {l === 'all' ? t.queue.all : l}
            </button>
          ))}
        </div>

        <Card className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-x-4 gap-y-2 !py-3">
          <span className="text-sm font-medium text-slate-200">🔔 {t.queue.alertTitle}</span>
          <div className="flex gap-1.5">
            {(['off', '1v1', '2v2', 'both'] as QueueAlertMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => alert.setMode(m)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${alert.mode === m ? 'bg-gold text-base-950' : 'bg-base-800 text-slate-400 hover:bg-base-700 hover:text-slate-200'}`}
              >
                {m === 'off' ? t.queue.alertOff : m === 'both' ? t.queue.alertBoth : m}
              </button>
            ))}
          </div>
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-400">
            <input type="checkbox" checked={alert.sound} onChange={(e) => alert.setSound(e.target.checked)} className="accent-[#8b5cf6]" />
            {t.queue.alertSound}
          </label>
          <p className="w-full text-center text-[11px] text-slate-500">{t.queue.alertHint}</p>
        </Card>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label={t.queue.active5} value={String(activity.m5)} accent="purple" />
          <StatCard label={t.queue.active15} value={String(activity.m15)} accent="purple" />
          <StatCard label={t.queue.active30} value={String(activity.m30)} accent="gold" />
          <StatCard
            label={t.queue.level}
            value={t.queue.levels[level]}
            accent={level === 'high' ? 'gold' : 'plain'}
            sub={t.queue.levelNote}
          />
        </div>

        <Card>
          <h3 className="mb-1 font-display text-base font-bold text-white">{t.queue.bestTimes}</h3>
          <p className="mb-3 text-xs text-slate-500">{t.queue.bestTimesNote}</p>
          <div className="flex h-24 items-end gap-1" aria-label={t.queue.bestTimes}>
            {hours.buckets.map((n, h) => (
              <div key={h} className="flex flex-1 flex-col items-center justify-end gap-1" title={`${String(h).padStart(2, '0')}:00 - ${n}`}>
                <div className={`w-full rounded-t ${h === nowHour ? 'bg-gold' : 'bg-accent/70'}`} style={{ height: `${Math.max(3, (n / hours.max) * 100)}%` }} />
                <span className={`text-[9px] ${h === nowHour ? 'text-gold-light' : 'text-slate-600'}`}>{h % 3 === 0 ? h : ''}</span>
              </div>
            ))}
          </div>
        </Card>

        <div>
          <h3 className="mb-3 font-display text-base font-bold text-white">{t.queue.recent}</h3>
          {error && <p className="text-sm text-slate-400">{t.queue.loadError}</p>}
          {!matches && !error && <Spinner />}
          {matches && shown.length === 0 && <p className="text-sm text-slate-400">{t.queue.empty}</p>}
          <div className="space-y-2">
            {shown.slice(0, LIST_LIMIT).map((m) => {
              const sides = [...new Set(m.players.map((p) => p.s))].sort((a, b) => a - b)
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
                  className="panel flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm transition-colors hover:border-accent/50 hover:bg-base-800/60"
                >
                  <div className="w-24 shrink-0">
                    <span className="rounded bg-base-700 px-1.5 py-0.5 text-xs font-bold text-white">{m.ladder}</span>
                    <div className="mt-1 text-xs text-slate-500">{relativeTime(Date.parse(m.ended_at), t)}</div>
                  </div>
                  <div className="w-32 shrink-0 text-xs text-slate-400">
                    <div className="text-slate-200">{m.map ?? '-'}</div>
                    <div>{fmtDuration(m.duration_s)}</div>
                  </div>
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
                    {sides.map((side, i) => {
                      const team = m.players.filter((p) => p.s === side)
                      const won = team.some((p) => p.w)
                      return (
                        <div key={side} className="flex items-center gap-3">
                          {i > 0 && <span className="text-xs text-slate-600">vs</span>}
                          <div className={`flex flex-col gap-0.5 rounded-lg border px-2.5 py-1.5 ${won ? 'border-gold/50 bg-gold/5' : 'border-base-700'}`}>
                            {won && <span className="text-[10px] font-bold uppercase tracking-wide text-gold-light">✓ {t.queue.winner}</span>}
                            {team.map((p, j) => (
                              <PlayerChip key={j} p={p} />
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <span className="ml-auto shrink-0 pl-4 font-mono text-xs text-slate-500">{m.game_id}</span>
                </div>
              )
            })}
          </div>
        </div>

        <p className="text-center text-xs text-slate-500">{t.queue.privacyNote}</p>
        <GameDetailModal gameId={openGame} onClose={() => setOpenGame(null)} />
      </section>
    </StatsShell>
  )
}
