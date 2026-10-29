import { Fragment, useEffect, useState, useMemo } from 'react'
import { useProfile } from '../lib/useProfile'
import { useRoster } from '../lib/useRoster'
import { isFfa, isTeam, is1v1, is2v2, isIncompleteRanked } from '../lib/stats'
import { RegistrationGate, StatsShell } from '../components/StatsShell'
import { SectionHeading, Spinner } from '../components/ui'
import GameDetailModal from '../components/GameDetailModal'
import { GameActionsBar, useGameActions, useOpenReport } from '../components/GameActionsBar'
import { fetchReactionTotals } from '../lib/reactions'
import { fetchClanScoreLedger, fmtScoreDelta, fmtRatioChange, type ClanScoreRow } from '../lib/clanScore'
import { useLanguage } from '../i18n/LanguageContext'
import { fetchGameDetailsBatch, teamRosterNames, fmtTeamRoster, type PlayerGame, type GameDetail } from '../lib/openfront'
import { CLAN_TAG } from '../config'
import { cleanDisplayName } from '../lib/displayName'
import { eloChangeFor, fmtEloChange, gameModeLabel, groupWinRate, isRankedGame, useMapSizes, useRankedElo, winRateClass } from '../lib/gameRows'

const PAGE_SIZE = 40

type Filter = 'all' | 'ffa' | 'team' | '1v1' | '2v2' | 'other' | 'reacted'

function fmtDuration(s: number): string {
  const m = Math.floor(s / 60)
  return `${m}m ${String(s % 60).padStart(2, '0')}s`
}

// Private is its own bucket (any mode) rather than a modifier on the other
// four - matches how the request framed it ("FFA, Teams, 1v1, 2v2, Private
// games" as five parallel options), and keeps the public-mode filters clean
// (a private FFA game only shows up under "Private", not double-counted
// under "FFA" too). Incomplete is a sixth, similarly orthogonal bucket -
// abandoned/never-finished games of ANY mode or type, most usefully the
// incomplete ranked 1v1/2v2 matches that every other filter hides
// entirely (see isIncompleteRanked) so they don't clutter the normal
// lists, but are still reachable here on purpose rather than just gone.
function matchesFilter(g: PlayerGame, filter: Filter): boolean {
  if (filter === 'reacted') return true
  if (filter === 'other') return g.type === 'Private' || g.result === 'incomplete'
  if (g.type === 'Private' || isIncompleteRanked(g)) return false
  if (filter === 'all') return true
  if (filter === 'ffa') return isFfa(g)
  if (filter === 'team') return isTeam(g)
  if (filter === '1v1') return is1v1(g)
  return is2v2(g)
}

const ALL_PLAYERS = 'all'

export default function History() {
  const { profile } = useProfile()
  const { t } = useLanguage()
  const { data, loading } = useRoster(!!profile)
  const [filter, setFilter] = useState<Filter>('all')
  const [playerFilter, setPlayerFilter] = useState<string>(ALL_PLAYERS)
  const [query, setQuery] = useState('')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const report = useOpenReport()
  const [clanScores, setClanScores] = useState<Map<string, ClanScoreRow>>(new Map())
  const [gameDetails, setGameDetails] = useState<Map<string, GameDetail>>(new Map())

  // Same game can show up under multiple members if several CYN players were
  // in it together - dedupe by gameId, keeping every member (publicId, not
  // just the name) so a shared game both credits everyone who played AND can
  // be filtered down to one registered member's own games exactly (matching
  // by name alone could collide - see MemberNameLink's own use of publicId
  // as the real identity everywhere else on the site). Unlike Home's
  // recent-games list, private games are kept here (they're one of the
  // filter buckets), so this is Every CYN game, not a subset. Computed above
  // the (profile/loading) early returns below since it feeds the effect
  // right after - `data?.members ?? []` already degrades to empty during
  // loading, same as every other read of `data` on this page.
  // `username` is THIS member's own actual OpenFront name in this specific
  // game (straight off their PlayerGame row), not their registered site
  // display name (m.name) - used as the fallback Player-column text below
  // when the full team roster can't be reconstructed. Confirmed live these
  // can differ: a member registered under e.g. "Peyz #5255" (whatever they
  // typed at registration) shows as their clean real name "Peyz" everywhere
  // a roster reconstructs fine, but used to fall back to the registered
  // string - with its own leftover suffix - specifically on the games that
  // couldn't reconstruct, looking like two different people across rows of
  // the same table.
  // Memoized: this walks every member's full game history and sorts the
  // result, and it used to rerun on EVERY render - any filter click, "show
  // more", or a background roster reload - even though it only depends on
  // the roster data. allGames needs just `data`; the filtered list adds the
  // two filter inputs.
  const allGames = useMemo(() => {
    const byGameId = new Map<string, { g: PlayerGame; members: { publicId: string; name: string; username: string }[] }>()
    for (const m of data?.members ?? []) {
      for (const g of m.cynGames) {
        const existing = byGameId.get(g.gameId)
        if (existing) existing.members.push({ publicId: m.publicId, name: m.name, username: g.username })
        else byGameId.set(g.gameId, { g, members: [{ publicId: m.publicId, name: m.name, username: g.username }] })
      }
    }
    return [...byGameId.values()].sort((a, b) => new Date(b.g.start).getTime() - new Date(a.g.start).getTime())
  }, [data])
  // The "Reactions" tab: loaded the first time it is opened, then every game that
  // has at least one reaction, most reacted first (newest first among equals).
  const [reactionTotals, setReactionTotals] = useState<Record<string, number> | null>(null)
  useEffect(() => {
    if (filter === 'reacted' && reactionTotals === null) fetchReactionTotals().then(setReactionTotals)
  }, [filter, reactionTotals])
  const filteredGames = useMemo(() => {
    const q = query.trim().toLowerCase()
    const byPlayer = ({ g, members }: { g: PlayerGame; members: { publicId: string; name: string; username: string }[] }) =>
      (playerFilter === ALL_PLAYERS || members.some((m) => m.publicId === playerFilter)) &&
      (!q || g.gameId.toLowerCase() === q || members.some((m) => m.publicId.toLowerCase() === q || m.name.toLowerCase().includes(q) || m.username.toLowerCase().includes(q)))
    if (filter === 'reacted') {
      const totals = reactionTotals ?? {}
      return allGames
        .filter((game) => (totals[game.g.gameId] ?? 0) > 0 && byPlayer(game))
        .sort((a, b) => (totals[b.g.gameId] ?? 0) - (totals[a.g.gameId] ?? 0) || new Date(b.g.start).getTime() - new Date(a.g.start).getTime())
    }
    return allGames.filter((game) => matchesFilter(game.g, filter) && byPlayer(game))
  }, [allGames, filter, playerFilter, query, reactionTotals])
  const visibleGames = filteredGames.slice(0, visibleCount)
  const remaining = filteredGames.length - visibleGames.length
  const gameActions = useGameActions(visibleGames.map(({ g }) => g.gameId))
  const eloByGame = useRankedElo(visibleGames.map(({ g }) => g))
  const mapSizes = useMapSizes(visibleGames.map(({ g }) => g))
  const memberById = useMemo(() => new Map((data?.members ?? []).map((m) => [m.publicId, m])), [data])
  const sortedMembers = useMemo(() => [...(data?.members ?? [])].sort((a, b) => a.name.localeCompare(b.name)), [data])

  // Batches one lookup per page of newly-revealed rows instead of one per
  // row - keyed on the visible gameIds themselves (stable string, not the
  // array reference) so paging/filtering fetches exactly the newly-missing
  // ids and nothing already known.
  const visibleGameIdsKey = visibleGames.map(({ g }) => g.gameId).join(',')
  useEffect(() => {
    const ids = visibleGameIdsKey ? visibleGameIdsKey.split(',').filter((id) => !clanScores.has(id)) : []
    if (ids.length === 0) return
    fetchClanScoreLedger(ids).then((fetched) => {
      if (fetched.size === 0) return
      setClanScores((prev) => new Map([...prev, ...fetched]))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleGameIdsKey])

  // Full team roster per game (see teamRosterNames) for the Player column
  // below - shows everyone who was actually on the team, not just whichever
  // registered members happened to play, same batching as clanScores above.
  useEffect(() => {
    const ids = visibleGameIdsKey ? visibleGameIdsKey.split(',').filter((id) => !gameDetails.has(id)) : []
    if (ids.length === 0) return
    fetchGameDetailsBatch(ids).then((fetched) => {
      const next = new Map<string, GameDetail>()
      for (const [id, detail] of fetched) if (detail) next.set(id, detail)
      if (next.size === 0) return
      setGameDetails((prev) => new Map([...prev, ...next]))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleGameIdsKey])

  if (!profile) return <RegistrationGate />
  if (loading) return <Spinner label={t.common.loadingLiveData} />

  const filters: { key: Filter; label: string }[] = [
    { key: 'all', label: t.history.filterAll },
    { key: 'ffa', label: t.history.filterFfa },
    { key: 'team', label: t.history.filterTeam },
    { key: '1v1', label: t.history.filter1v1 },
    { key: '2v2', label: t.history.filter2v2 },
    { key: 'other', label: `${t.history.filterPrivate} / ${t.history.filterIncomplete}` },
    { key: 'reacted', label: t.history.filterReacted },
  ]

  return (
    <StatsShell>
      <section className="space-y-4">
        <SectionHeading center eyebrow={t.history.eyebrow} title={t.history.title} />

        <div className="flex flex-wrap justify-center gap-2">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => {
                setFilter(f.key)
                setVisibleCount(PAGE_SIZE)
              }}
              className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                filter === f.key ? 'bg-accent text-white' : 'bg-base-800 text-slate-400 hover:bg-base-700 hover:text-slate-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setVisibleCount(PAGE_SIZE)
            }}
            aria-label={t.common.searchPlayerOrId}
            placeholder={t.common.searchPlayerOrId}
            className="w-full max-w-sm rounded-lg border border-base-600 bg-base-800 px-3.5 py-2 text-sm text-white placeholder:text-slate-500 focus:border-accent focus:outline-none"
          />
          <select
            value={playerFilter}
            onChange={(e) => {
              setPlayerFilter(e.target.value)
              setVisibleCount(PAGE_SIZE)
            }}
            className="rounded-lg border border-base-600 bg-base-800 px-3.5 py-2 text-sm text-white focus:border-accent focus:outline-none"
          >
            <option value={ALL_PLAYERS}>{t.history.allPlayers}</option>
            {sortedMembers.map((m) => (
              <option key={m.publicId} value={m.publicId}>
                {cleanDisplayName(m.name)}
              </option>
            ))}
          </select>
        </div>

        {filteredGames.length === 0 ? (
          <p className="text-center text-sm text-slate-500">{t.history.noGames}</p>
        ) : (
          <div className="panel overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-base-700 text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-3 text-left font-semibold">{t.common.table.date}</th>
                    <th className="px-4 py-3 text-left font-semibold">{t.common.table.player}</th>
                    <th className="px-4 py-3 text-left font-semibold">{t.common.table.mode}</th>
                    <th className="px-4 py-3 text-right font-semibold">{t.common.table.players}</th>
                    <th className="px-4 py-3 text-right font-semibold">Win Score / Elo</th>
                    <th className="px-4 py-3 text-right font-semibold">[{CLAN_TAG}] Ratio</th>
                    <th className="px-4 py-3 text-left font-semibold">{t.common.table.map}</th>
                    <th className="px-4 py-3 text-right font-semibold">{t.common.table.duration}</th>
                    <th className="px-4 py-3 text-right font-semibold">{t.common.table.result}</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleGames.map(({ g, members }) => {
                    const clanScore = clanScores.get(g.gameId)
                    const ratioChange = clanScore ? fmtRatioChange(clanScore.ratioBefore, clanScore.ratioAfter) : null
                    // Ranked games: the Elo the game gave (when the ranked feed knows it); the ratio cell shows the member's win rate
                    // in that ladder, so it is never empty for a game that has no clan ratio.
                    const elo = isRankedGame(g) ? eloChangeFor(eloByGame, g.gameId, members.map((m) => m.publicId)) : null
                    const winRate = groupWinRate(memberById.get(members[0]?.publicId), g)
                    // Full team roster when it can be reconstructed (see
                    // teamRosterNames) - everyone who was actually there,
                    // not just whichever registered members happened to
                    // play. Falls back to just the registered names for an
                    // incomplete game, a not-yet-fetched detail, or a loss
                    // where the losing team can't be determined.
                    const detail = gameDetails.get(g.gameId)
                    const memberUsernames = members.map((m) => m.username)
                    const fullRoster = detail && g.result !== 'incomplete' ? teamRosterNames(detail, g.result === 'victory', memberUsernames) : null
                    const playerDisplay = fullRoster ? fmtTeamRoster(fullRoster) : memberUsernames.map(cleanDisplayName).join(', ')
                    return (
                      <Fragment key={g.gameId}>
                      <tr
                        onClick={() => report.open(g.gameId)}
                        className="cursor-pointer hover:bg-base-800/50"
                        title={t.home.clickForReportTitle}
                      >
                        <td className="px-4 py-2.5 text-slate-400">{new Date(g.start).toLocaleDateString('en-GB')}</td>
                        <td className="px-4 py-2.5 text-white">{playerDisplay}</td>
                        <td className={`whitespace-nowrap px-4 py-2.5 ${isRankedGame(g) ? 'font-medium text-gold-light' : 'text-slate-300'}`}>
                          {gameModeLabel(g)}
                          {g.type === 'Private' && <span className="ml-1.5 text-xs text-slate-500">({t.history.filterPrivate})</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-slate-400">{g.totalPlayers ?? '-'}</td>
                        {isRankedGame(g) ? (
                          <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${elo ? (elo.d >= 0 ? 'text-signal-green' : 'text-signal-red') : 'text-slate-600'}`}>
                            {elo ? (
                              <>
                                {elo.before != null && <span className="mr-1.5 font-normal text-slate-400">{elo.before}</span>}
                                {fmtEloChange(elo)}
                              </>
                            ) : (
                              '-'
                            )}
                          </td>
                        ) : (
                          <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${clanScore ? (clanScore.won ? 'text-signal-green' : 'text-signal-red') : 'text-slate-600'}`}>
                            {clanScore ? fmtScoreDelta(clanScore.score, clanScore.won) : '-'}
                          </td>
                        )}
                        <td className={`px-4 py-2.5 text-right tabular-nums ${ratioChange || winRate == null ? 'text-slate-400' : winRateClass(winRate)}`}>
                          {ratioChange ?? (winRate != null ? `WR ${winRate}%` : '-')}
                        </td>
                        <td className="px-4 py-2.5 text-slate-400">
                          {g.map}
                          {mapSizes.get(g.gameId) === 'Compact' && <span className="ml-1 text-gold-light">({t.queue.mapCompact})</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-slate-400">{fmtDuration(g.durationSeconds)}</td>
                        <td className={`px-4 py-2.5 text-right font-medium ${g.result === 'victory' ? 'text-signal-green' : g.result === 'defeat' ? 'text-signal-red' : 'text-slate-500'}`}>
                          {g.result}
                        </td>
                      </tr>
                      <tr onClick={() => report.open(g.gameId)} title={t.home.clickForReportTitle} className="cursor-pointer border-b border-base-700/50 last:border-0 hover:bg-base-800/50">
                        <td colSpan={9} className="px-3 pb-1.5">
                          <GameActionsBar
                            gameId={g.gameId}
                            memberIds={members.map((m) => m.publicId)}
                            title={`${gameModeLabel(g)} · ${g.map}`}
                            actions={gameActions}
                            onOpenComments={report.openComments}
                          />
                        </td>
                      </tr>
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {remaining > 0 && (
          <div className="flex justify-center gap-3">
            <button onClick={() => setVisibleCount((c) => c + PAGE_SIZE)} className="btn-ghost">
              {t.history.showMore(Math.min(remaining, PAGE_SIZE))}
            </button>
            <button onClick={() => setVisibleCount(filteredGames.length)} className="btn-ghost">
              {t.history.showAll}
            </button>
          </div>
        )}
      </section>

      <GameDetailModal gameId={report.openGame} focusComments={report.focusComments} onClose={report.close} />
    </StatsShell>
  )
}
