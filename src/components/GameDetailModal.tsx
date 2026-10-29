import { useEffect, useRef, useState, type ReactNode } from 'react'
import { fetchGameDetail, isUnscoredTeamGame, type GameDetail, type GamePlayerStat } from '../lib/openfront'
import type { GameTileStats, ReplayProgress } from '../lib/replaySim'
import { fetchClanScoreLedger, fmtScoreDelta, fmtRatioChange, otherClanScoresForGame, type ClanScoreRow } from '../lib/clanScore'
import { CLAN_TAG } from '../config'
import { Emoji, EMOJI } from './Emoji'
import { useLanguage } from '../i18n/LanguageContext'
import { useProfile } from '../lib/useProfile'
import { saveGame, unsaveGame, useSavedGames } from '../lib/savedGames'
import type { TranslationShape } from '../i18n/translations'
import GameComments from './GameComments'

// The report lists this many places (teams, or players in a solo game) before "show more".
const TOP_PLACES = 10

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

export default function GameDetailModal({ gameId, onClose, focusComments }: { gameId: string | null; onClose: () => void; focusComments?: boolean }) {
  const { t } = useLanguage()
  const [detail, setDetail] = useState<GameDetail | null>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading')
  const { profile } = useProfile()
  const saved = useSavedGames(profile?.openfront_id)
  const isSaved = saved.games.some((g) => g.game_id === gameId)
  const [saveFailed, setSaveFailed] = useState(false)

  // Max Tiles replays the whole game to find each player's peak (and their
  // real end-of-game tile count), so it's computed separately and doesn't
  // block the rest of the modal - see replaySim.ts. The replay itself runs
  // in the background independent of this component (see getGameTileStats),
  // so closing the modal or switching games doesn't restart it, and its
  // result is cached permanently once computed.
  const [tileStats, setTileStats] = useState<GameTileStats | null>(null)
  const [tileState, setTileState] = useState<'loading' | 'ok' | 'error'>('loading')
  const [tileProgress, setTileProgress] = useState<ReplayProgress | null>(null)

  const [showAll, setShowAll] = useState(false)
  const commentsRef = useRef<HTMLDivElement>(null)

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
    setShowAll(false)
  }, [gameId])

  // Opened from a comment button: jump to the comments as soon as the report is on screen.
  useEffect(() => {
    if (focusComments && state === 'ok') commentsRef.current?.scrollIntoView({ block: 'start' })
  }, [focusComments, state, gameId])

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
  // Ranked 2v2 and clan wars are not clan sessions at OpenFront: no Win Score / Loss Score for them.
  const unscored = detail ? isUnscoredTeamGame(detail) : false
  const otherClanScores = detail && !unscored ? otherClanScoresForGame(detail, CLAN_TAG) : []

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
      // Default order: who held the most land at their peak, then the winners and the kills.
      return compareNullable(a.maxPercent, b.maxPercent, -1) || Number(b.isWinner) - Number(a.isWinner) || b.kills - a.kills || b.gold - a.gold
    })

  // Places of the report. A team game ranks TEAMS (1, 2, ...) by the sum of their players' max tiles; the members stand under
  // their team. OpenFront's report does not say who was on a losing team, so a team is rebuilt from what it does say: the
  // winners are one team, players of one clan tag are one team (clan members are placed together), the rest stand alone.
  interface Place {
    key: string
    rows: Row[]
    sum: number | null
    isTeam: boolean
  }
  const grouped = !!detail && sortKey === null && (detail.numTeams != null || rows.some((r) => r.p.teamIndex != null))
  const teamKey = (r: Row) =>
    r.p.teamIndex != null ? `i${r.p.teamIndex}` : r.isWinner && winners.length > 1 ? 'win' : r.p.clanTag ? `tag:${r.p.clanTag}` : `solo:${r.p.clientID}`
  const places: Place[] = []
  if (grouped) {
    const byKey = new Map<string, Row[]>()
    for (const r of rows) byKey.set(teamKey(r), [...(byKey.get(teamKey(r)) ?? []), r])
    for (const [key, members] of byKey) {
      const known = members.filter((m) => m.maxPercent != null)
      places.push({ key, rows: members, sum: known.length ? known.reduce((acc, m) => acc + (m.maxPercent ?? 0), 0) : null, isTeam: members.length > 1 })
    }
    places.sort((a, b) => compareNullable(a.sum, b.sum, -1) || Number(b.rows.some((r) => r.isWinner)) - Number(a.rows.some((r) => r.isWinner)))
  } else {
    for (const r of rows) places.push({ key: r.p.clientID, rows: [r], sum: r.maxPercent, isTeam: false })
  }
  const shownPlaces = showAll ? places : places.slice(0, TOP_PLACES)
  const hiddenPlaces = places.length - shownPlaces.length

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

  const scoreEntries: { tag: string; won: boolean; score: number; ratio: string | null }[] = [
    ...(clanScore && !unscored ? [{ tag: CLAN_TAG, won: clanScore.won, score: clanScore.score, ratio: fmtRatioChange(clanScore.ratioBefore, clanScore.ratioAfter) }] : []),
    ...otherClanScores.map((c) => ({ tag: c.clanTag, won: c.won, score: c.score, ratio: null })),
  ]

  function maxTilesCell(r: Row): ReactNode {
    if (tileState === 'loading') {
      return (
        <span className="text-slate-600">
          {tileProgress && tileProgress.totalTicks > 0 ? `${Math.min(99, Math.round((tileProgress.tick / tileProgress.totalTicks) * 100))}%` : '…'}
        </span>
      )
    }
    if (tileState === 'error') return <span className="text-slate-600">-</span>
    return r.maxPercent != null ? `${r.maxPercent.toFixed(1)}%` : <span className="text-slate-600">-</span>
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
        <div className="flex items-center justify-between gap-2 border-b border-base-700 px-4 py-3 sm:px-6 sm:py-4">
          <h2 className="min-w-0 truncate font-display text-lg font-bold text-white sm:text-xl">{t.gameDetail.title}</h2>
          <div className="flex shrink-0 items-center gap-2">
            {saveFailed && <span className="text-xs text-signal-red">{t.gameDetail.saveFailed}</span>}
            {profile && gameId && (
              <button
                type="button"
                onClick={() => {
                  setSaveFailed(false)
                  const done = isSaved
                    ? unsaveGame(profile.openfront_id, gameId)
                    : saveGame(profile.openfront_id, gameId, detail ? `${detail.map} · ${detail.players.length}` : gameId)
                  void done.then((ok) => setSaveFailed(!ok))
                }}
                title={isSaved ? t.gameDetail.unsaveHint : t.gameDetail.saveHint}
                aria-label={isSaved ? t.gameDetail.saved : t.gameDetail.save}
                className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 py-1 text-sm font-medium transition-colors sm:px-3 ${isSaved ? 'border-gold/60 bg-gold/10 text-gold-light' : 'border-base-600 text-slate-300 hover:bg-base-800'}`}
              >
                <span aria-hidden>{isSaved ? '★' : '☆'}</span>
                <span className="hidden min-[420px]:inline">{isSaved ? t.gameDetail.saved : t.gameDetail.save}</span>
              </button>
            )}
          <button onClick={onClose} className="rounded-md px-2 py-1 text-slate-400 hover:bg-base-800 hover:text-white" aria-label={t.gameDetail.closeAria}>✕</button>
          </div>
        </div>

        {state === 'loading' && <p className="px-6 py-16 text-center text-slate-400">{t.gameDetail.loading}</p>}
        {state === 'error' && <p className="px-6 py-16 text-center text-slate-400">{t.gameDetail.loadError}</p>}

        {state === 'ok' && detail && (
          <div className="p-4 sm:p-6">
            {/* header tiles */}
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Tile label={t.gameDetail.tileDuration} value={fmtDuration(detail.durationSeconds)} />
              <Tile label={t.gameDetail.tileWinner} value={winnerDisplay} accent />
              <Tile label={t.gameDetail.tilePlayers} value={String(detail.players.length)} />
              <Tile label={t.gameDetail.tileMap} value={detail.map} />
            </div>

            {/* game id + replay */}
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

            <div className={`grid gap-4 ${scoreEntries.length > 0 ? 'lg:grid-cols-[minmax(0,1fr)_200px]' : ''}`}>
              <div className="min-w-0">
                {/* table-fixed + a fixed column width plan (colgroup below) keeps the
                    table's total width constant no matter how long any single
                    cell's content is - a long player name truncates with an
                    ellipsis (full name on hover) instead of forcing the whole
                    table, and therefore the page, to scroll horizontally. */}
                <div className="overflow-x-auto rounded-xl border border-base-700">
                  <table className="sticky-cols w-full min-w-[620px] text-[13px] sm:min-w-0 sm:table-fixed">
                    <colgroup>
                      <col className="w-8" />
                      <col />
                      {columns.map((c) => (
                        <col key={c.key} className="w-[11%]" />
                      ))}
                    </colgroup>
                    <thead>
                      <tr className="border-b border-base-700 text-[11px] uppercase tracking-wide text-slate-400">
                        <th className="px-2 py-2 text-left font-semibold">{t.monthly.colRank}</th>
                        <th
                          onClick={() => onSortClick('clan')}
                          className="cursor-pointer select-none px-2 py-2 text-left font-semibold hover:text-white"
                          title={t.gameDetail.sortBy(t.common.table.player)}
                        >
                          {t.common.table.player}
                          {sortKey === 'clan' && <span className="ml-1">{sortDir === -1 ? '▼' : '▲'}</span>}
                        </th>
                        {columns.map((c) => (
                          <th
                            key={c.key}
                            onClick={() => onSortClick(c.key)}
                            className="cursor-pointer select-none truncate px-1.5 py-2 text-right font-semibold hover:text-white"
                            title={t.gameDetail.sortBy(c.label)}
                          >
                            {c.icon ? <ThIcon label={c.label}><Emoji char={c.icon} className="h-3.5 w-3.5 shrink-0" /></ThIcon> : c.label}
                            {sortKey === c.key && <span className="ml-1">{sortDir === -1 ? '▼' : '▲'}</span>}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {shownPlaces.map((place, pi) => {
                        const playerRow = (r: Row, rank: ReactNode, indented: boolean) => {
                          const isCyn = r.p.clanTag === CLAN_TAG
                          return (
                            <tr key={r.p.clientID} className={`border-b border-base-700/50 last:border-0 ${isCyn ? 'bg-accent/5' : ''}`}>
                              <td className="px-2 py-1.5 font-display font-bold text-slate-500">{rank}</td>
                              <td className={`max-w-0 py-1.5 ${indented ? 'pl-5 pr-2' : 'px-2'}`}>
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
                              <td className="truncate px-1.5 py-1.5 text-right tabular-nums text-slate-400">{fmt(r.out)}</td>
                              <td className="truncate px-1.5 py-1.5 text-right tabular-nums text-slate-400">{fmt(r.inc)}</td>
                              <td className="truncate px-1.5 py-1.5 text-right tabular-nums text-gold-light">{fmt(r.gold)}</td>
                              <td className="truncate px-1.5 py-1.5 text-right tabular-nums">
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
                              <td className="truncate px-1.5 py-1.5 text-right tabular-nums text-slate-400">{maxTilesCell(r)}</td>
                              <td className="truncate px-1.5 py-1.5 text-right tabular-nums text-slate-500">{r.deathSec != null ? fmtDuration(r.deathSec) : '-'}</td>
                            </tr>
                          )
                        }
                        if (!place.isTeam) return playerRow(place.rows[0], pi + 1, false)
                        const winning = place.rows.some((r) => r.isWinner)
                        const tags = [...new Set(place.rows.map((r) => r.p.clanTag).filter(Boolean))]
                        return [
                          <tr key={place.key} className={`border-b border-base-700/50 ${winning ? 'bg-gold/5' : 'bg-base-850/50'}`}>
                            <td className="px-2 py-1.5 font-display font-bold text-white">{pi + 1}</td>
                            <td colSpan={5} className="px-2 py-1.5 font-semibold text-white">
                              {t.report.team(pi + 1)}
                              {tags.length === 1 && <span className="ml-1.5 font-normal text-slate-400">[{tags[0]}]</span>}
                              {winning && <Emoji char={EMOJI.trophy} label={t.gameDetail.tileWinner} className="ml-1.5 h-3.5 w-3.5" />}
                            </td>
                            <td className="px-1.5 py-1.5 text-right font-semibold tabular-nums text-white">
                              {place.sum != null ? `${place.sum.toFixed(1)}%` : tileState === 'loading' ? '…' : '-'}
                            </td>
                            <td />
                          </tr>,
                          ...place.rows.map((r) => playerRow(r, <span className="text-slate-700">·</span>, true)),
                        ]
                      })}
                    </tbody>
                  </table>
                </div>
                {places.length > TOP_PLACES && (
                  <div className="mt-3 flex justify-center">
                    <button type="button" onClick={() => setShowAll((v) => !v)} className="btn-ghost text-sm">
                      {showAll ? t.report.showLess : t.report.showMore(hiddenPlaces)}
                    </button>
                  </div>
                )}
                {grouped && places.some((p) => p.isTeam) && <p className="mt-2 text-center text-[11px] text-slate-600">{t.report.teamsApprox}</p>}
              </div>

              {scoreEntries.length > 0 && (
                <aside className="space-y-2 lg:self-start">
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">{t.report.clanScores}</p>
                  {scoreEntries.map((e) => (
                    <div
                      key={e.tag}
                      className={`rounded-lg border px-3 py-2 ${e.won ? 'border-signal-green/30 bg-signal-green/10' : 'border-signal-red/30 bg-signal-red/10'}`}
                    >
                      <p className="font-display text-sm font-bold text-white">[{e.tag}]</p>
                      <p className={`text-sm font-semibold tabular-nums ${e.won ? 'text-signal-green' : 'text-signal-red'}`}>
                        {e.won ? t.report.winScore : t.report.lossScore} {fmtScoreDelta(e.score, e.won)}
                      </p>
                      {e.ratio && <p className="text-xs text-slate-400">Ratio: {e.ratio}</p>}
                    </div>
                  ))}
                </aside>
              )}
            </div>
            <p className="mt-3 text-center text-xs text-slate-500">{t.gameDetail.footerNote}</p>

            <div ref={commentsRef} className="mt-6 scroll-mt-4 border-t border-base-700 pt-5">
              <GameComments gameId={detail.gameId} />
            </div>
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
