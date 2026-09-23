import { useEffect, useState } from 'react'
import { useProfile } from '../lib/useProfile'
import { useRoster } from '../lib/useRoster'
import { isFfa, isTeam, is1v1, is2v2 } from '../lib/stats'
import { RegistrationGate, StatsShell } from '../components/StatsShell'
import { SectionHeading, Spinner } from '../components/ui'
import GameDetailModal from '../components/GameDetailModal'
import { fetchClanScoreLedger, fmtScoreDelta, fmtRatioChange, type ClanScoreRow } from '../lib/clanScore'
import { useLanguage } from '../i18n/LanguageContext'
import { fetchGameDetailsBatch, teamRosterNames, fmtTeamRoster, type PlayerGame, type GameDetail } from '../lib/openfront'
import { CLAN_TAG } from '../config'

const PAGE_SIZE = 40

type Filter = 'all' | 'ffa' | 'team' | '1v1' | '2v2' | 'private'

function modeLabel(g: PlayerGame): string {
  return is1v1(g) ? '1v1' : is2v2(g) ? '2v2' : isTeam(g) ? 'Team' : isFfa(g) ? 'FFA' : g.mode
}

function fmtDuration(s: number): string {
  const m = Math.floor(s / 60)
  return `${m}m ${String(s % 60).padStart(2, '0')}s`
}

// Private is its own bucket (any mode) rather than a modifier on the other
// four - matches how the request framed it ("FFA, Teams, 1v1, 2v2, Private
// games" as five parallel options), and keeps the public-mode filters clean
// (a private FFA game only shows up under "Private", not double-counted
// under "FFA" too).
function matchesFilter(g: PlayerGame, filter: Filter): boolean {
  if (filter === 'private') return g.type === 'Private'
  if (g.type === 'Private') return false
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
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [openGame, setOpenGame] = useState<string | null>(null)
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
  const byGameId = new Map<string, { g: PlayerGame; members: { publicId: string; name: string }[] }>()
  for (const m of data?.members ?? []) {
    for (const g of m.cynGames) {
      const existing = byGameId.get(g.gameId)
      if (existing) existing.members.push({ publicId: m.publicId, name: m.name })
      else byGameId.set(g.gameId, { g, members: [{ publicId: m.publicId, name: m.name }] })
    }
  }
  const allGames = [...byGameId.values()].sort((a, b) => new Date(b.g.start).getTime() - new Date(a.g.start).getTime())
  const filteredGames = allGames.filter(
    ({ g, members }) => matchesFilter(g, filter) && (playerFilter === ALL_PLAYERS || members.some((m) => m.publicId === playerFilter)),
  )
  const visibleGames = filteredGames.slice(0, visibleCount)
  const remaining = filteredGames.length - visibleGames.length
  const sortedMembers = [...(data?.members ?? [])].sort((a, b) => a.name.localeCompare(b.name))

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
    { key: 'private', label: t.history.filterPrivate },
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

        <div className="flex justify-center">
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
                {m.name}
              </option>
            ))}
          </select>
        </div>

        {filteredGames.length === 0 ? (
          <p className="text-center text-sm text-slate-500">{t.history.noGames}</p>
        ) : (
          <div className="panel overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-sm">
                <thead>
                  <tr className="border-b border-base-700 text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-3 text-left font-semibold">{t.common.table.date}</th>
                    <th className="px-4 py-3 text-left font-semibold">{t.common.table.player}</th>
                    <th className="px-4 py-3 text-left font-semibold">{t.common.table.mode}</th>
                    <th className="px-4 py-3 text-right font-semibold">Win Score</th>
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
                    // Full team roster when it can be reconstructed (see
                    // teamRosterNames) - everyone who was actually there,
                    // not just whichever registered members happened to
                    // play. Falls back to just the registered names for an
                    // incomplete game, a not-yet-fetched detail, or a loss
                    // where the losing team can't be determined.
                    const detail = gameDetails.get(g.gameId)
                    const registeredNames = members.map((m) => m.name)
                    const fullRoster = detail && g.result !== 'incomplete' ? teamRosterNames(detail, g.result === 'victory', registeredNames) : null
                    const playerDisplay = fullRoster ? fmtTeamRoster(fullRoster) : registeredNames.join(', ')
                    return (
                      <tr
                        key={g.gameId}
                        onClick={() => setOpenGame(g.gameId)}
                        className="cursor-pointer border-b border-base-700/50 last:border-0 hover:bg-base-800/50"
                        title={t.home.clickForReportTitle}
                      >
                        <td className="px-4 py-2.5 text-slate-400">{new Date(g.start).toLocaleDateString('en-GB')}</td>
                        <td className="px-4 py-2.5 text-white">{playerDisplay}</td>
                        <td className="px-4 py-2.5 text-slate-300">
                          {modeLabel(g)}
                          {g.type === 'Private' && <span className="ml-1.5 text-xs text-slate-500">({t.history.filterPrivate})</span>}
                        </td>
                        <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${clanScore ? (clanScore.won ? 'text-signal-green' : 'text-signal-red') : 'text-slate-600'}`}>
                          {clanScore ? fmtScoreDelta(clanScore.score, clanScore.won) : '-'}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-slate-400">{ratioChange ?? '-'}</td>
                        <td className="px-4 py-2.5 text-slate-400">{g.map}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-slate-400">{fmtDuration(g.durationSeconds)}</td>
                        <td className={`px-4 py-2.5 text-right font-medium ${g.result === 'victory' ? 'text-signal-green' : g.result === 'defeat' ? 'text-signal-red' : 'text-slate-500'}`}>
                          {g.result}
                        </td>
                      </tr>
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

      <GameDetailModal gameId={openGame} onClose={() => setOpenGame(null)} />
    </StatsShell>
  )
}
