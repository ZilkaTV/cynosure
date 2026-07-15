import { useEffect, useState } from 'react'
import { fetchGameDetail, type GameDetail, type GamePlayerStat } from '../lib/openfront'
import type { GameTileStats } from '../lib/replaySim'
import { CLAN_TAG } from '../config'
import { Emoji, EMOJI } from './Emoji'
import { useLanguage } from '../i18n/LanguageContext'
import type { TranslationShape } from '../i18n/translations'

function fmt(n: number): string {
  if (!isFinite(n) || n === 0) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return `${Math.round(n)}`
}

function fmtDuration(s: number): string {
  const m = Math.floor(s / 60)
  return `${m}m ${String(Math.round(s % 60)).padStart(2, '0')}s`
}

function num(v: string | undefined): number {
  return v ? Number(v) : 0
}

function replayUrl(gameId: string): string {
  return `https://openfront-tools.frozenpenguin.media?id=${encodeURIComponent(gameId)}`
}

/** null-safe compare - rows missing a stat always sort to the bottom, whichever direction. */
function compareNullable(a: number | null, b: number | null, dir: 1 | -1): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  return (a - b) * dir
}

interface Row {
  p: GamePlayerStat
  out: number
  inc: number
  gold: number
  kills: number
  victims: string[]
  deathSec: number | null
  maxPercent: number | null
  isWinner: boolean
}

type SortKey = 'out' | 'inc' | 'gold' | 'kills' | 'maxPercent' | 'deathSec'

function getColumns(t: TranslationShape): { key: SortKey; label: string; icon?: string }[] {
  return [
    { key: 'out', label: t.gameDetail.colOut, icon: EMOJI.sword },
    { key: 'inc', label: t.gameDetail.colIn, icon: EMOJI.shield },
    { key: 'gold', label: t.gameDetail.colGold, icon: EMOJI.coin },
    { key: 'kills', label: t.gameDetail.colKills, icon: EMOJI.skull },
    { key: 'maxPercent', label: t.gameDetail.colMaxTiles },
    { key: 'deathSec', label: t.gameDetail.colDeath, icon: EMOJI.cross },
  ]
}

function ThIcon({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1" title={label}>
      {children}
      {label}
    </span>
  )
}

export default function GameDetailModal({ gameId, onClose }: { gameId: string | null; onClose: () => void }) {
  const { t } = useLanguage()
  const [detail, setDetail] = useState<GameDetail | null>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading')

  // Max Tiles replays the whole game to find each player's peak (and their
  // real end-of-game tile count), so it's computed separately and doesn't
  // block the rest of the modal - see replaySim.ts.
  const [tileStats, setTileStats] = useState<GameTileStats | null>(null)
  const [tileState, setTileState] = useState<'loading' | 'ok' | 'error'>('loading')

  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<1 | -1>(-1)

  useEffect(() => {
    if (!gameId) return
    setState('loading')
    setDetail(null)
    fetchGameDetail(gameId)
      .then((d) => {
        if (d) {
          setDetail(d)
          setState('ok')
        } else setState('error')
      })
      .catch(() => setState('error'))
  }, [gameId])

  useEffect(() => {
    if (!gameId) return
    setTileState('loading')
    setTileStats(null)
    // Replaying a whole game runs a CPU-heavy tick loop - without actually
    // aborting it, switching to a different game (or closing the modal)
    // would leave the old replay running in the background, competing for
    // CPU with whatever comes next. See getGameTileStats in replaySim.ts.
    const controller = new AbortController()
    import('../lib/replaySim')
      .then(({ getGameTileStats }) => getGameTileStats(gameId, controller.signal))
      .then((result) => {
        if (controller.signal.aborted) return
        if (result) {
          setTileStats(result)
          setTileState('ok')
        } else setTileState('error')
      })
      .catch(() => {
        if (!controller.signal.aborted) setTileState('error')
      })
    return () => {
      controller.abort()
    }
  }, [gameId])

  useEffect(() => {
    setSortKey(null)
    setSortDir(-1)
  }, [gameId])

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [onClose])

  if (!gameId) return null

  const columns = getColumns(t)
  const durMin = detail ? detail.durationSeconds / 60 : 1
  const tickRate = detail && detail.durationSeconds ? detail.numTurns / detail.durationSeconds : 10

  const byId = new Map<string, GamePlayerStat>()
  detail?.players.forEach((p) => byId.set(p.clientID, p))
  const winner = detail?.winnerClientId ? byId.get(detail.winnerClientId) : null

  const rows: Row[] = (detail?.players ?? [])
    .map((p) => {
      const st = p.stats ?? {}
      const goldTotal = (st.gold ?? []).reduce((s, g) => s + num(g), 0)
      const kills = st.kills ?? []
      const killedAt = st.killedAt ? num(st.killedAt) : null
      return {
        p,
        out: num(st.attacks?.[0]) / durMin,
        inc: num(st.attacks?.[1]) / durMin,
        gold: goldTotal / durMin,
        kills: kills.length,
        victims: kills.map((k) => byId.get(k.victim)?.username ?? t.gameDetail.unknownPlayer),
        deathSec: killedAt != null ? killedAt / tickRate : null,
        maxPercent: tileStats?.maxPercent[p.clientID] ?? null,
        isWinner: detail?.winnerClientId === p.clientID,
      }
    })
    .sort((a, b) => {
      if (sortKey) return compareNullable(a[sortKey], b[sortKey], sortDir)
      return Number(b.isWinner) - Number(a.isWinner) || b.kills - a.kills || b.gold - a.gold
    })

  function onSortClick(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === -1 ? 1 : -1))
    } else {
      setSortKey(key)
      setSortDir(-1)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="my-8 w-full max-w-4xl rounded-2xl border border-base-600 bg-base-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-base-700 px-6 py-4">
          <h2 className="font-display text-xl font-bold text-white">{t.gameDetail.title}</h2>
          <button onClick={onClose} className="rounded-md px-2 py-1 text-slate-400 hover:bg-base-800 hover:text-white" aria-label={t.gameDetail.closeAria}>✕</button>
        </div>

        {state === 'loading' && <p className="px-6 py-16 text-center text-slate-400">{t.gameDetail.loading}</p>}
        {state === 'error' && <p className="px-6 py-16 text-center text-slate-400">{t.gameDetail.loadError}</p>}

        {state === 'ok' && detail && (
          <div className="p-6">
            {/* header tiles */}
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Tile label={t.gameDetail.tileDuration} value={fmtDuration(detail.durationSeconds)} />
              <Tile label={t.gameDetail.tileWinner} value={winner?.username ?? '-'} accent />
              <Tile label={t.gameDetail.tilePlayers} value={String(detail.players.length)} />
              <Tile label={t.gameDetail.tileMap} value={detail.map} />
            </div>
            <div className="mb-4 flex flex-wrap items-center justify-center gap-3">
              <p className="text-center text-xs text-slate-500">
                {t.gameDetail.gameIdLabel} <span className="font-mono text-slate-300">{detail.gameId}</span>
                {detail.start ? ` · ${new Date(detail.start).toLocaleString('en-GB')}` : ''}
              </p>
              <a
                href={replayUrl(detail.gameId)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-base-600 px-2.5 py-1 text-xs font-semibold text-accent-light hover:border-accent hover:text-white"
              >
                <Emoji char={EMOJI.map} className="h-3.5 w-3.5" /> {t.gameDetail.watchReplay}
              </a>
            </div>

            <div className="overflow-x-auto rounded-xl border border-base-700">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="border-b border-base-700 text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-3 py-2.5 text-left font-semibold">{t.monthly.colRank}</th>
                    <th className="px-3 py-2.5 text-left font-semibold">{t.common.table.player}</th>
                    {columns.map((c) => (
                      <th
                        key={c.key}
                        onClick={() => onSortClick(c.key)}
                        className="cursor-pointer select-none px-3 py-2.5 text-right font-semibold hover:text-white"
                        title={t.gameDetail.sortBy(c.label)}
                      >
                        {c.icon ? <ThIcon label={c.label}><Emoji char={c.icon} className="h-3.5 w-3.5" /></ThIcon> : c.label}
                        {sortKey === c.key && <span className="ml-1">{sortDir === -1 ? '▼' : '▲'}</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const isCyn = r.p.clanTag === CLAN_TAG
                    return (
                      <tr key={r.p.clientID} className={`border-b border-base-700/50 last:border-0 ${isCyn ? 'bg-accent/5' : ''}`}>
                        <td className="px-3 py-2 font-display font-bold text-slate-500">{i + 1}</td>
                        <td className="px-3 py-2">
                          <span className={isCyn ? 'font-semibold text-accent-light' : 'text-slate-200'}>
                            {r.p.clanTag && <span className="text-slate-500">[{r.p.clanTag}] </span>}
                            {r.p.username}
                            {r.isWinner && <Emoji char={EMOJI.trophy} label={t.gameDetail.tileWinner} className="ml-1 h-3.5 w-3.5" />}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-400">{fmt(r.out)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-400">{fmt(r.inc)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-gold-light">{fmt(r.gold)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {r.kills > 0 ? (
                            <span
                              className="cursor-help font-semibold text-white underline decoration-dotted underline-offset-2"
                              title={t.gameDetail.killedTooltip(r.victims.join(', '))}
                            >
                              {r.kills}
                            </span>
                          ) : (
                            <span className="text-slate-600">0</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-400">
                          {tileState === 'loading' && <span className="text-slate-600">{t.gameDetail.computing}</span>}
                          {tileState === 'error' && <span className="text-slate-600">-</span>}
                          {tileState === 'ok' &&
                            (r.maxPercent != null ? `${r.maxPercent.toFixed(1)}%` : <span className="text-slate-600">-</span>)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                          {r.deathSec != null ? fmtDuration(r.deathSec) : '-'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-center text-xs text-slate-500">{t.gameDetail.footerNote}</p>
          </div>
        )}
      </div>
    </div>
  )
}

function Tile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-base-700 bg-base-850/60 px-4 py-3 text-center">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-0.5 font-display text-lg font-bold ${accent ? 'text-accent-light' : 'text-white'}`}>{value}</p>
    </div>
  )
}
