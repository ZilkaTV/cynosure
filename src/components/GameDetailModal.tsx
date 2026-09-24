import { useEffect, useState } from 'react'
import { fetchGameDetail, type GameDetail, type GamePlayerStat } from '../lib/openfront'
import type { GameTileStats, ReplayProgress } from '../lib/replaySim'
import { fetchClanScoreLedger, fmtScoreDelta, fmtRatioChange, otherClanScoresForGame, type ClanScoreRow } from '../lib/clanScore'
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

/**
 * "Winner" tile text: a solo win (1v1/FFA) shows that player's username, same
 * as before. A team win shows the winning TEAM instead - [CYN] if any of its
 * players won, else whichever tag is the clear majority among the winners,
 * else a generic player count for a genuinely mixed/untagged team (no single
 * clan "won" it).
 */
function describeWinner(winners: GamePlayerStat[]): string {
  if (winners.length === 0) return '-'
  if (winners.length === 1) return winners[0].username
  if (winners.some((p) => p.clanTag === CLAN_TAG)) return `[${CLAN_TAG}]`
  const byTag = new Map<string, number>()
  for (const p of winners) if (p.clanTag) byTag.set(p.clanTag, (byTag.get(p.clanTag) ?? 0) + 1)
  const [topTag, topCount] = [...byTag.entries()].sort((a, b) => b[1] - a[1])[0] ?? []
  if (topTag && topCount! > winners.length / 2) return `[${topTag}]`
  return `${winners.length} Players`
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

type SortKey = 'out' | 'inc' | 'gold' | 'kills' | 'maxPercent' | 'deathSec' | 'clan'

function getColumns(t: TranslationShape): { key: SortKey; label: string; icon?: string }[] {
  return [
    { key: 'out', label: t.gameDetail.colOut, icon: EMOJI.sword },
    { key: 'inc', label: t.gameDetail.colIn, icon: EMOJI.shield },
    { key: 'gold', label: t.gameDetail.colGold, icon: EMOJI.coin },
    { key: 'kills', label: t.gameDetail.colKills, icon: EMOJI.skull },
    { key: 'maxPercent', label: t.gameDetail.colMaxTiles, icon: EMOJI.globeAfrica },
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
  // block the rest of the modal - see replaySim.ts. The replay itself runs
  // in the background independent of this component (see getGameTileStats),
  // so closing the modal or switching games doesn't restart it, and its
  // result is cached permanently once computed.
  const [tileStats, setTileStats] = useState<GameTileStats | null>(null)
  const [tileState, setTileState] = useState<'loading' | 'ok' | 'error'>('loading')
  const [tileProgress, setTileProgress] = useState<ReplayProgress | null>(null)

  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<1 | -1>(-1)

  // Win Score/Loss Score/Ratio for this specific game (see clanScore.ts) -
  // null for a game that isn't in cyn_clan_score_ledger (not a Team game,
  // not eligible, or the cron just hasn't reached it yet), which the UI
  // below just renders nothing for rather than an error.
  const [clanScore, setClanScore] = useState<ClanScoreRow | null>(null)

  useEffect(() => {
    if (!gameId) return
    setState('loading')
    setDetail(null)
    setClanScore(null)
    fetchGameDetail(gameId)
      .then((d) => {
        if (d) {
          setDetail(d)
          setState('ok')
        } else setState('error')
      })
      .catch(() => setState('error'))
    fetchClanScoreLedger([gameId]).then((m) => setClanScore(m.get(gameId) ?? null))
  }, [gameId])

  useEffect(() => {
    if (!gameId) return
    setTileState('loading')
    setTileStats(null)
    setTileProgress(null)
    let cancelled = false
    let unsubscribe = () => {}
    import('../lib/replaySim').then(({ getGameTileStats, subscribeReplayProgress }) => {
      if (cancelled) return
      unsubscribe = subscribeReplayProgress(gameId, (p) => {
        if (!cancelled) setTileProgress(p)
      })
      getGameTileStats(gameId)
        .then((result) => {
          if (cancelled) return
          if (result) {
            setTileStats(result)
            setTileState('ok')
          } else setTileState('error')
        })
        .catch(() => {
          if (!cancelled) setTileState('error')
        })
    })
    return () => {
      cancelled = true
      unsubscribe()
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
  const winnerClientIds = new Set(detail?.winnerClientIds ?? [])
  const winners = (detail?.players ?? []).filter((p) => winnerClientIds.has(p.clientID))
  const winnerDisplay = describeWinner(winners)
  const otherClanScores = detail ? otherClanScoresForGame(detail, CLAN_TAG) : []

  const rows: Row[] = (detail?.players ?? [])
    .map((p) => {
      const st = p.stats ?? {}
      const goldTotal = (st.gold ?? []).reduce((s, g) => s + num(g), 0)
      // OpenFront's own raw kill log sometimes lists the exact same victim
      // clientID twice for one killer (confirmed directly against a real
      // game - a duplicate event on OpenFront's end, not something on our
      // side double-counting) - a player can only actually die once, so
      // deduping by victim clientID here is what makes both the kill count
      // and the "Killed: ..." tooltip agree with each other and with
      // reality, instead of both faithfully reproducing the same inflated
      // duplicate.
      const rawKills = st.kills ?? []
      const kills = [...new Map(rawKills.map((k) => [k.victim, k])).values()]
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
        isWinner: winnerClientIds.has(p.clientID),
      }
    })
    .sort((a, b) => {
      // Clan-grouped sort: alphabetical by clan tag (untagged players always
      // last regardless of direction - there's no clan to group them under),
      // then alphabetical by username within a clan so the group stays
      // stable as its members' stats change.
      if (sortKey === 'clan') {
        const at = a.p.clanTag ?? ''
        const bt = b.p.clanTag ?? ''
        if (at !== bt) {
          if (!at) return 1
          if (!bt) return -1
          return at.localeCompare(bt) * sortDir
        }
        return a.p.username.localeCompare(b.p.username)
      }
      if (sortKey) return compareNullable(a[sortKey], b[sortKey], sortDir)
      return Number(b.isWinner) - Number(a.isWinner) || b.kills - a.kills || b.gold - a.gold
    })

  // Numbers each distinct clan in the currently-sorted order (1, 2, 3, ...)
  // so the "alphabetische Clans nummeriert" badge stays stable no matter
  // which direction the clan sort is toggled to.
  const clanGroupNumbers = new Map<string, number>()
  if (sortKey === 'clan') {
    for (const r of rows) {
      const tag = r.p.clanTag
      if (tag && !clanGroupNumbers.has(tag)) clanGroupNumbers.set(tag, clanGroupNumbers.size + 1)
    }
  }

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
        className="my-8 w-full max-w-6xl rounded-2xl border border-base-600 bg-base-900 shadow-2xl"
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
              <Tile label={t.gameDetail.tileWinner} value={winnerDisplay} accent />
              <Tile label={t.gameDetail.tilePlayers} value={String(detail.players.length)} />
              <Tile label={t.gameDetail.tileMap} value={detail.map} />
            </div>

            {clanScore && (
              <div
                className={`mb-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 rounded-lg border px-4 py-2.5 text-sm ${
                  clanScore.won ? 'border-signal-green/30 bg-signal-green/10' : 'border-signal-red/30 bg-signal-red/10'
                }`}
              >
                <span className={`font-display font-bold ${clanScore.won ? 'text-signal-green' : 'text-signal-red'}`}>
                  {clanScore.won ? 'Win Score' : 'Loss Score'} {fmtScoreDelta(clanScore.score, clanScore.won)}
                </span>
                {fmtRatioChange(clanScore.ratioBefore, clanScore.ratioAfter) && (
                  <span className="text-slate-300">
                    [{CLAN_TAG}] Ratio: {fmtRatioChange(clanScore.ratioBefore, clanScore.ratioAfter)}
                  </span>
                )}
              </div>
            )}

            {otherClanScores.length > 0 && (
              <div className="mb-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-slate-400">
                {otherClanScores.map((c) => (
                  <span key={c.clanTag} className={c.won ? 'text-signal-green' : 'text-signal-red'}>
                    [{c.clanTag}] {c.won ? 'Win Score' : 'Loss Score'} {fmtScoreDelta(c.score, c.won)}
                  </span>
                ))}
              </div>
            )}

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

            {/* table-fixed + a fixed column width plan (colgroup below) keeps the
                table's total width constant no matter how long any single
                cell's content is - a long player name truncates with an
                ellipsis (full name on hover) instead of forcing the whole
                table, and therefore the page, to scroll horizontally. */}
            <div className="rounded-xl border border-base-700">
              <table className="w-full table-fixed text-sm">
                <colgroup>
                  <col className="w-8" />
                  <col />
                  {columns.map((c) => (
                    <col key={c.key} className="w-[13%]" />
                  ))}
                </colgroup>
                <thead>
                  <tr className="border-b border-base-700 text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-2 py-2.5 text-left font-semibold">{t.monthly.colRank}</th>
                    <th
                      onClick={() => onSortClick('clan')}
                      className="cursor-pointer select-none px-3 py-2.5 text-left font-semibold hover:text-white"
                      title={t.gameDetail.sortBy(t.common.table.player)}
                    >
                      {t.common.table.player}
                      {sortKey === 'clan' && <span className="ml-1">{sortDir === -1 ? '▼' : '▲'}</span>}
                    </th>
                    {columns.map((c) => (
                      <th
                        key={c.key}
                        onClick={() => onSortClick(c.key)}
                        className="cursor-pointer select-none truncate px-2 py-2.5 text-right font-semibold hover:text-white"
                        title={t.gameDetail.sortBy(c.label)}
                      >
                        {c.icon ? <ThIcon label={c.label}><Emoji char={c.icon} className="h-3.5 w-3.5 shrink-0" /></ThIcon> : c.label}
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
                        <td className="px-2 py-2 font-display font-bold text-slate-500">{i + 1}</td>
                        <td className="max-w-0 px-3 py-2">
                          <span
                            className={`flex items-center gap-1 truncate ${isCyn ? 'font-semibold text-accent-light' : 'text-slate-200'}`}
                            title={r.p.clanTag ? `[${r.p.clanTag}] ${r.p.username}` : r.p.username}
                          >
                            <span className="truncate">
                              {r.p.clanTag && (
                                <span className="text-slate-500">
                                  [{r.p.clanTag}]{sortKey === 'clan' && clanGroupNumbers.has(r.p.clanTag) && (
                                    <sup className="ml-0.5 text-accent-light">{clanGroupNumbers.get(r.p.clanTag)}</sup>
                                  )}{' '}
                                </span>
                              )}
                              {r.p.username}
                            </span>
                            {r.isWinner && <Emoji char={EMOJI.trophy} label={t.gameDetail.tileWinner} className="h-3.5 w-3.5 shrink-0" />}
                          </span>
                        </td>
                        <td className="truncate px-2 py-2 text-right tabular-nums text-slate-400">{fmt(r.out)}</td>
                        <td className="truncate px-2 py-2 text-right tabular-nums text-slate-400">{fmt(r.inc)}</td>
                        <td className="truncate px-2 py-2 text-right tabular-nums text-gold-light">{fmt(r.gold)}</td>
                        <td className="truncate px-2 py-2 text-right tabular-nums">
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
                        <td className="truncate px-2 py-2 text-right tabular-nums text-slate-400">
                          {tileState === 'loading' && (
                            <span className="text-slate-600">
                              {tileProgress && tileProgress.totalTicks > 0
                                ? `${Math.min(99, Math.round((tileProgress.tick / tileProgress.totalTicks) * 100))}%`
                                : '…'}
                            </span>
                          )}
                          {tileState === 'error' && <span className="text-slate-600">-</span>}
                          {tileState === 'ok' &&
                            (r.maxPercent != null ? `${r.maxPercent.toFixed(1)}%` : <span className="text-slate-600">-</span>)}
                        </td>
                        <td className="truncate px-2 py-2 text-right tabular-nums text-slate-500">
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
