import { Fragment, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { RoleName, useClanIds, useWinsIndex } from '../components/RoleName'
import { Card, SectionHeading, StatCard, Spinner, relativeTime } from '../components/ui'
import { StatsShell } from '../components/StatsShell'
import GameDetailModal, { replayUrl } from '../components/GameDetailModal'
import { useLanguage } from '../i18n/LanguageContext'
import { supabase as db } from '../lib/supabase'
import { useQueueAlertSettings, testQueueAlert } from '../lib/queueNotify'
import { useSharedRoster } from '../lib/access'
import { cleanDisplayName } from '../lib/displayName'

// The signed-in visitor's own account (GET /api/queue/me): named next to the in-game name when they played under another name.
interface MyAccount {
  k: string
  name: string
  boards: { '1v1'?: { rank: number; elo: number }; '2v2'?: { rank: number; elo: number }; ffa?: { rank: number; elo: number } }
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
  /** a member of the clan (the clan list is public, so the public id is stored) */
  m?: boolean
  d?: number // Elo change (only for top-100 players using their own name); with `c` it is the total of the last c games
  c?: number
  /** Elo change worked out from the opponent's (1v1 is zero-sum), not measured for this player. */
  mirrored?: boolean
}
interface FeedMatch {
  game_id: string
  ladder: '1v1' | '2v2' | 'ffa'
  ended_at: string
  duration_s: number | null
  map: string | null
  top_count: number
  players: FeedPlayer[]
}

/** Colours per ladder: 1v1 violet, 2v2 teal, ranked FFA amber. */
const LADDER_LOOK = {
  '1v1': { border: 'border-l-violet-500', tag: 'bg-violet-500/25 text-violet-200', tab: 'bg-accent text-white' },
  '2v2': { border: 'border-l-teal-500', tag: 'bg-teal-500/25 text-teal-200', tab: 'bg-teal-600 text-white' },
  ffa: { border: 'border-l-amber-500', tag: 'bg-amber-500/25 text-amber-200', tab: 'bg-amber-600 text-white' },
} as const
const maxEloFor = (ladder: string) => (ladder === 'ffa' ? 90 : 30)

const REFRESH_MS = 30_000
// Traffic light: distinct top-100 players who finished a game in the last 30 minutes.
const BUSY_FROM = 12
const MEDIUM_FROM = 5
const LIST_LIMIT = 60

/**
 * A change that covers several games (Σ) belongs to a game of the matching outcome: a net loss to the latest game the
 * player lost, a net gain to the latest game they won. Rows stored before the collector did this are moved here.
 */
function relocateSums(all: FeedMatch[]): FeedMatch[] {
  const sorted = [...all].sort((a, b) => Date.parse(a.ended_at) - Date.parse(b.ended_at))
  const byKey = new Map<string, { m: FeedMatch; p: FeedPlayer }[]>()
  for (const m of sorted) {
    for (const p of m.players) {
      if (!p.k) continue
      const key = `${m.ladder}|${p.k}`
      const list = byKey.get(key) ?? []
      list.push({ m, p })
      byKey.set(key, list)
    }
  }
  const removed = new Set<string>()
  const placed = new Map<string, { d: number; c: number }>()
  for (const list of byKey.values()) {
    list.forEach((entry, i) => {
      const { p } = entry
      if (!p.c || p.d === undefined) return
      const wantWin = p.d > 0
      if (p.w === wantWin) return // already on a game of the matching outcome
      const window = list.slice(Math.max(0, i - (p.c - 1)), i + 1).filter((x) => !isAbandoned(x.m))
      const target = [...window].reverse().find((x) => x.p.w === wantWin && x.p.d === undefined && !placed.has(`${x.m.game_id}|${x.p.k}`))
      removed.add(`${entry.m.game_id}|${p.k}`)
      if (target) placed.set(`${target.m.game_id}|${target.p.k}`, { d: p.d, c: p.c })
    })
  }
  if (removed.size === 0) return all
  return all.map((m) => ({
    ...m,
    players: m.players.map((p) => {
      const key = `${m.game_id}|${p.k}`
      const put = placed.get(key)
      if (put) return { ...p, d: put.d, c: put.c }
      if (removed.has(key)) {
        const rest = { ...p }
        delete rest.d
        delete rest.c
        return rest
      }
      return p
    }),
  }))
}

/** In a 1v1 the winner gains exactly what the loser loses: fill in the missing side from the one that is known. */
function withMirroredElo(m: FeedMatch): FeedPlayer[] {
  // A single game cannot take points from a winner or give them to a loser: such a change belongs to another game.
  const hasWinner = m.players.some((p) => p.w)
  const players = m.players.map((p) => {
    if (p.d === undefined) return p
    // One game moves a rating by 30 at most (a sum over c games by 30 each).
    const tooBig = Math.abs(p.d) > maxEloFor(m.ladder) * (p.c ?? 1)
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

type Boards = { '1v1': Record<string, { rank: number; elo: number }>; '2v2': Record<string, { rank: number; elo: number }>; ffa: Record<string, { rank: number; elo: number }> }

function PlayerChip({ p, mine, ladder, boards, names }: { p: FeedPlayer; mine?: MyAccount | null; ladder?: '1v1' | '2v2' | 'ffa'; boards?: Boards | null; names?: Map<string, string> }) {
  const wins = useWinsIndex()
  const clan = useClanIds()
  // Only the visitor's own account is named - nobody else's other name is ever revealed here.
  const own = mine && p.k && p.k === mine.k && p.r == null ? mine : null
  // A player under another name has no rank stored with the game: take the current board position by public id.
  const boardEntry = p.r == null && p.id && ladder ? boards?.[ladder]?.[p.id] : undefined
  const ownBoard = (own && ladder ? own.boards[ladder] : undefined) ?? boardEntry
  // A registered member who plays under another name in the queue: the public id tells who it is, so the member's own name is added.
  const real = !own && p.id ? names?.get(p.id) : undefined
  const showReal = real && cleanDisplayName(real).toLowerCase() !== cleanDisplayName(p.n).toLowerCase() ? real : null
  // A registered member: the name opens their profile on this site (in the colours of their wins role); the id below goes to OpenFront like before.
  const memberId = p.id && names?.has(p.id) ? p.id : null
  // The CYN badge needs the clan list on OpenFront: being registered here (p.m / memberId come from the site's own member table) stays after
  // somebody leaves the clan. Until the clan list is known the registration is used, as before.
  const inClan = clan && p.id ? clan.has(p.id) : !!(p.m || memberId)
  const openfront = p.id ? `https://openfront.io/#modal=profile&publicID=${encodeURIComponent(p.id)}` : null
  const nameNode = memberId ? (
    <Link to={`/member/${memberId}`} className="hover:text-accent-light">
      <RoleName wins={wins.byId.get(memberId)}>{cleanDisplayName(p.n)}</RoleName>
    </Link>
  ) : openfront ? (
    <a href={openfront} target="_blank" rel="noreferrer" className="hover:text-accent-light">
      {cleanDisplayName(p.n)}
    </a>
  ) : (
    cleanDisplayName(p.n)
  )
  const label = (
    <span className={`min-w-0 ${p.w ? 'font-semibold text-white' : 'text-slate-200'}`}>
      {p.t ? <span className="font-normal text-slate-500">[{p.t}] </span> : null}
      {nameNode}
      {own && <span className="ml-1 font-normal text-gold-light">({cleanDisplayName(own.name)})</span>}
      {showReal && <span className="ml-1 font-normal text-gold-light">({cleanDisplayName(showReal)})</span>}
      {openfront && (
        <a href={openfront} target="_blank" rel="noreferrer" title={`OpenFront: ${p.id}`} aria-label="OpenFront profile" className="ml-1.5 text-[11px] font-normal text-slate-600 hover:text-accent-light">
          ↗
        </a>
      )}
    </span>
  )
  const chip = 'rounded px-1.5 py-0.5 text-[10px] font-bold leading-none'
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      {label}
      <span className="ml-auto flex flex-wrap items-center justify-end gap-1">
        {p.r != null && (
          <span className={`${chip} bg-gold/15 text-gold-light`}>
            #{p.r}
            {p.e != null ? ` · ${p.e}` : ''}
          </span>
        )}
        {inClan && p.t !== 'CYN' && <span className={`${chip} bg-accent/20 text-accent-light`}>CYN</span>}
        {p.d !== undefined && (
          <span title={p.mirrored ? "Elo is zero-sum in 1v1: the opponent’s change, mirrored" : undefined} className={`${chip} tabular-nums ${p.d > 0 ? 'bg-emerald-500/15 text-emerald-300' : p.d < 0 ? 'bg-rose-500/15 text-rose-300' : 'bg-base-700 text-slate-400'}`}>
            {p.c ? 'Σ ' : p.mirrored ? '≈ ' : ''}
            {p.d > 0 ? '+' : ''}
            {p.d} Elo{p.c ? ` (${p.c})` : ''}
          </span>
        )}
        {ownBoard && p.r == null && (
          <span className={`${chip} bg-gold/15 text-gold-light`}>
            #{ownBoard.rank} · {ownBoard.elo}
          </span>
        )}
        {p.r == null && p.b && !ownBoard && (
          // Stored as "top 100" when the game was played; if the current board (loaded) no longer lists the player, say so.
          <span className={`${chip} bg-base-700 font-medium text-slate-400`}>{p.id && ladder && boards?.[ladder] && Object.keys(boards[ladder]).length > 0 ? 'ex Top 100' : 'Top 100'}</span>
        )}
      </span>
    </div>
  )
}

export default function RankedQueue() {
  const { t } = useLanguage()
  const [matches, setMatches] = useState<FeedMatch[] | null>(null)
  const [error, setError] = useState(false)
  const [openGame, setOpenGame] = useState<string | null>(null)
  const [allQueue, setAllQueue] = useState(false)
  const alert = useQueueAlertSettings()
  const [me, setMe] = useState<MyAccount | null>(null)
  const [boards, setBoards] = useState<Boards | null>(null)
  // public OpenFront id -> the name the member is registered under (the member list is public on the site)
  const roster = useSharedRoster()
  const memberNames = useMemo(() => new Map((roster?.members ?? []).map((m) => [m.publicId, m.name] as const)), [roster])
  // Current top-100 boards (the site's roster document, cached for a minute at the edge): rank and Elo of players who
  // play under another name.
  useEffect(() => {
    let alive = true
    const load = () =>
      fetch('/api/roster')
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (alive && j?.ranked_1v1) setBoards({ '1v1': j.ranked_1v1 ?? {}, '2v2': j.ranked_2v2 ?? {}, ffa: j.ranked_ffa ?? {} })
        })
        .catch(() => {})
    void load()
    const timer = setInterval(() => document.visibilityState === 'visible' && void load(), 5 * 60_000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [])
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

  const relocated = useMemo(() => relocateSums(matches ?? []), [matches])
  // the two duel ladders side by side (the ranked FFA queue is gone since OpenFront v0.36.0)
  const columns = useMemo(() => ({ '1v1': relocated.filter((m) => m.ladder === '1v1'), '2v2': relocated.filter((m) => m.ladder === '2v2') }), [relocated])
  const shown = useMemo(() => [...columns['1v1'], ...columns['2v2']], [columns])

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

  // one finished game of a ladder
  const matchRow = (m: FeedMatch) => {
    const players = withMirroredElo(m)
    // the winner first, then the others
    const sides = [...new Set(players.map((p) => p.s))].sort((a, b) => Number(players.some((p) => p.s === b && p.w)) - Number(players.some((p) => p.s === a && p.w)) || a - b)
    const abandoned = isAbandoned(m)
    const [mapName, mapSize] = (m.map ?? '-').split(' · ')
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
        className={`panel cursor-pointer space-y-2.5 border-l-4 p-3 text-sm transition-colors hover:bg-base-800/60 ${abandoned ? 'border-l-slate-600 opacity-60' : LADDER_LOOK[m.ladder].border}`}
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          {abandoned && (
            <span className="rounded bg-slate-600/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-300" title={m.ladder === '2v2' ? t.queue.abandoned2v2 : t.queue.abandoned1v1}>
              {t.queue.abandoned}
            </span>
          )}
          <span className="font-medium text-slate-200">{mapName}</span>
          {mapSize && (
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${mapSize === 'Compact' ? 'bg-amber-500/20 text-amber-300' : 'bg-base-700 text-slate-300'}`}>
              {mapSize === 'Compact' ? t.queue.mapCompact : t.queue.mapNormal}
            </span>
          )}
          <span className="tabular-nums text-slate-500">{fmtDuration(m.duration_s)}</span>
          <span className="ml-auto text-slate-500">{relativeTime(Date.parse(m.ended_at), t)}</span>
        </div>
        <div className="space-y-1.5">
          {sides.map((side, i) => {
            const team = players.filter((p) => p.s === side)
            const won = team.some((p) => p.w)
            return (
              <Fragment key={side}>
                {i > 0 && (
                  <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-slate-600" aria-hidden="true">
                    <span className="h-px flex-1 bg-base-700/60" />
                    vs
                    <span className="h-px flex-1 bg-base-700/60" />
                  </div>
                )}
                <div className={`space-y-1 rounded-lg border px-3 py-2 ${won && !abandoned ? 'border-gold/40 bg-gold/5' : 'border-base-700/70 bg-base-900/30'}`}>
                  {won && !abandoned && <p className="text-[10px] font-bold uppercase tracking-wide text-gold-light">✓ {t.queue.winner}</p>}
                  {team.map((p, j) => (
                    <PlayerChip key={j} p={p} mine={me} ladder={m.ladder} boards={boards} names={memberNames} />
                  ))}
                </div>
              </Fragment>
            )
          })}
        </div>
        <div className="flex justify-end">
          <a href={replayUrl(m.game_id)} target="_blank" rel="noreferrer" title={m.game_id} className="inline-flex items-center gap-1.5 rounded-md border border-base-600 px-2.5 py-1 text-xs font-semibold text-accent-light transition-colors hover:border-accent hover:text-white">
            <span aria-hidden="true">▶</span> {t.gameDetail.watchReplay}
          </a>
        </div>
      </div>
    )
  }

  return (
    <StatsShell>
      <section className="space-y-6">
        <SectionHeading center eyebrow={t.queue.eyebrow} title={t.queue.title} />
        <p className="mx-auto max-w-2xl text-center text-xs text-slate-400 sm:text-sm">{t.queue.intro}</p>
        {loadedAt && <p className="text-center text-[11px] tabular-nums text-slate-500">↻ {new Date(loadedAt).toLocaleTimeString()}</p>}

        <Card className="flex w-full flex-wrap items-center justify-center gap-x-4 gap-y-2 !py-3">
          <span className="text-sm font-medium text-slate-200">🔔 {t.queue.alertTitle}</span>
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            {(['1v1', '2v2'] as const).map((l) => {
              const on = alert.on(l)
              return (
                <button
                  key={l}
                  type="button"
                  role="switch"
                  aria-checked={on}
                  onClick={() => alert.toggle(l, !on)}
                  className="flex items-center gap-2 text-sm text-slate-200"
                >
                  <span className={`relative inline-block h-6 w-11 rounded-full transition-colors ${on ? (l === '1v1' ? 'bg-violet-500' : l === '2v2' ? 'bg-teal-500' : 'bg-amber-500') : 'bg-base-700'}`}>
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
          {alert.permission === 'denied' && alert.ladders.length > 0 && <p className="w-full text-center text-xs text-amber-300">{t.queue.permissionDenied}</p>}
          <p className="w-full text-center text-[11px] text-slate-500">{t.queue.alertHint}</p>
        </Card>


        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <div className="panel flex items-center justify-center gap-3 px-3 py-4 sm:justify-start sm:px-5" title={t.queue.lampRule(MEDIUM_FROM, BUSY_FROM)}>
            <div className="flex shrink-0 flex-col gap-1 rounded-lg bg-base-950 p-1.5" role="img" aria-label={t.queue.levels[level]}>
              {(['low', 'medium', 'high'] as const).map((l) => (
                <span
                  key={l}
                  className={`block h-3.5 w-3.5 rounded-full transition-all ${
                  l === 'low' ? (level === l ? 'bg-red-500 shadow-[0_0_12px_2px_rgba(239,68,68,0.7)]' : 'bg-red-950') : l === 'medium' ? (level === l ? 'bg-amber-400 shadow-[0_0_12px_2px_rgba(251,191,36,0.7)]' : 'bg-amber-950') : level === l ? 'bg-emerald-400 shadow-[0_0_12px_2px_rgba(52,211,153,0.7)]' : 'bg-emerald-950'
                }`}
                />
              ))}
            </div>
            <div className="hidden min-w-0 sm:block">
              <p className="mb-1 text-xs uppercase tracking-wide text-slate-400">{t.queue.level}</p>
              <p className="font-display text-2xl font-bold text-white">{t.queue.levels[level]}</p>
            </div>
          </div>
          <StatCard label={t.queue.active5} value={String(activity.m5)} accent="purple" />
          <StatCard label={t.queue.active15} value={String(activity.m15)} accent="purple" />
        </div>
        <p className="text-center text-xs text-slate-500">{t.queue.lampRule(MEDIUM_FROM, BUSY_FROM)}</p>

        <div className="grid items-start gap-4 lg:grid-cols-2">
          {(['1v1', '2v2'] as const).map((l) => (
            <div key={l} className="min-w-0">
              <h3 className="mb-3 flex items-center gap-2 font-display text-base font-bold text-white">
                <span className={`rounded px-2 py-0.5 text-sm font-bold ${LADDER_LOOK[l].tag}`}>{l}</span>
                {t.queue.recent}
              </h3>
              {error && <p className="text-sm text-slate-400">{t.queue.loadError}</p>}
              {!matches && !error && <Spinner />}
              {matches && columns[l].length === 0 && <p className="text-sm text-slate-400">{t.queue.empty}</p>}
              <div className="space-y-2">{columns[l].slice(0, allQueue ? LIST_LIMIT : 10).map(matchRow)}</div>
            </div>
          ))}
        </div>

        {Math.max(columns['1v1'].length, columns['2v2'].length) > 10 && (
          <div className="flex justify-center">
            <button type="button" onClick={() => setAllQueue((v) => !v)} className="btn-ghost text-sm">
              {allQueue ? t.common.showTopOnly(10) : t.common.showAll(Math.min(Math.max(columns['1v1'].length, columns['2v2'].length), LIST_LIMIT))}
            </button>
          </div>
        )}
        <p className="text-center text-xs text-slate-500">{t.queue.eloNote}</p>
        <p className="text-center text-xs text-slate-500">{t.queue.privacyNote}</p>
        <GameDetailModal gameId={openGame} onClose={() => setOpenGame(null)} />
      </section>
    </StatsShell>
  )
}
