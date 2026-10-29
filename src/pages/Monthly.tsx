import { useEffect, useMemo, useState } from 'react'
import { CLAN_TAG } from '../config'
import { useProfile } from '../lib/useProfile'
import { useRoster } from '../lib/useRoster'
import { RegistrationGate, StatsShell, TagNotice } from '../components/StatsShell'
import { DecayForecastWindow, PointsPlannerWindow } from '../components/PlannerWindows'
import GameDetailModal from '../components/GameDetailModal'
import { ReactionCell } from '../components/ReactionCell'
import { useReactions } from '../lib/useReactions'
import { winRateClass } from '../lib/gameRows'
import { Card, EloDelta, LastUpdated, MemberNameLink, SectionHeading, Spinner, StatCard } from '../components/ui'
import { Emoji, EMOJI } from '../components/Emoji'
import { useLanguage } from '../i18n/LanguageContext'
import type { TranslationShape } from '../i18n/translations'
import type { PlayerGame } from '../lib/openfront'
import {
  availableMonths,
  currentMonthKey,
  ffaMonthly,
  isFfa,
  isTeam,
  is1v1,
  is2v2,
  monthKeyOf,
  monthLabel,
  oneVoneBucket,
  rankedFfaBucket,
  twoVTwoBucket,
  teamMonthly,
  winRate,
  type MemberStats,
} from '../lib/stats'
import { fetchMonthlyEloForAllMembers, type MonthlyEloPoint } from '../lib/trends'
import { cynPlayersByGame as cynPlayersByGameOf, memberWinScore } from '../lib/winScore'
import { fetchClanLeaderboardEntry, fetchClanScoreLedger, type ClanLeaderboardEntry, type ClanScoreRow } from '../lib/clanScore'

function fmtDuration(s: number): string {
  const m = Math.floor(s / 60)
  return `${m}m ${String(s % 60).padStart(2, '0')}s`
}

const LATEST_GAMES_COUNT = 10

/** Latest N distinct clan games of one mode within a given month, deduped across members (same pattern as Home.tsx's recent-games list). */
function latestModeGames(members: MemberStats[], month: string, isMode: (g: PlayerGame) => boolean) {
  const byGameId = new Map<string, { g: PlayerGame; memberNames: string[]; memberIds: string[] }>()
  for (const m of members) {
    for (const g of m.cynGames) {
      if (g.type === 'Private' || !isMode(g) || monthKeyOf(g.start) !== month) continue
      const existing = byGameId.get(g.gameId)
      if (existing) {
        existing.memberNames.push(m.name)
        existing.memberIds.push(m.publicId)
      } else byGameId.set(g.gameId, { g, memberNames: [m.name], memberIds: [m.publicId] })
    }
  }
  return [...byGameId.values()]
    .sort((a, b) => new Date(b.g.start).getTime() - new Date(a.g.start).getTime())
    .slice(0, LATEST_GAMES_COUNT)
}

// 'ffa' and 'team' are the monthly game tables; '1v1', '2v2' and 'rffa' are the ranked (Elo) boards.
type Variant = 'ffa' | 'team' | '1v1' | '2v2' | 'rffa'

function fmtGold(n: number | null): string {
  if (n == null) return '-'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return `${Math.round(n)}`
}

function rulesFor(variant: Variant, t: TranslationShape): React.ReactNode | null {
  if (variant === 'ffa') {
    return (
      <>
        <li>
          <span className="font-semibold text-white">Points:</span> a single win counts 1 point; a streak of 2 or more wins in a row counts double its length (3 wins in a row = 6 points). A loss ends the streak.
        </li>
        <li>Public FFA games with the [CYN] tag only; the Elo of the ranked FFA games is on the Ranked page.</li>
      </>
    )
  }
  if (variant === 'rffa') {
    return (
      <>
        <li>
          <span className="font-semibold text-white">{t.monthly.rulesFfa1Bold}</span> {t.monthly.rulesFfa1Rest}
        </li>
        <li>
          <span className="font-semibold text-white">{t.monthly.rulesFfa2Label}</span> {t.monthly.rulesFfa2Mid}{' '}
          <span className="font-semibold text-white">{t.monthly.rulesFfa2Bold}</span>.
        </li>
      </>
    )
  }
  if (variant === 'team') {
    return (
      <>
        <li>
          <span className="font-semibold text-white">{t.monthly.rulesTeam1Bold}</span> {t.monthly.rulesTeam1Rest}
        </li>
        <li>
          <span className="font-semibold text-white">{t.monthly.rulesTeam2Bold}</span> {t.monthly.rulesTeam2Rest(CLAN_TAG)}
        </li>
      </>
    )
  }
  return null
}

interface Leader {
  name: string
  value: number
}

/** null-safe compare - rows missing a stat always sort to the bottom, whichever direction. */
function compareNullable(a: number | null, b: number | null, dir: 1 | -1): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  return (a - b) * dir
}

/** Clickable column header that sorts a table - shared across all three monthly tables. */
function SortTh({
  label,
  sortKey,
  active,
  dir,
  onClick,
  align = 'right',
}: {
  label: string
  sortKey: string
  active: boolean
  dir: 1 | -1
  onClick: (key: string) => void
  align?: 'left' | 'right'
}) {
  return (
    <th
      onClick={() => onClick(sortKey)}
      className={`cursor-pointer select-none px-3 py-3 font-semibold hover:text-white ${align === 'right' ? 'text-right' : 'text-left'}`}
    >
      {label}
      {active && <span className="ml-1">{dir === -1 ? '▼' : '▲'}</span>}
    </th>
  )
}

/** A "title" earned by the monthly leader in one category, showing their number. */
function TitleCard({
  emoji,
  title,
  metric,
  leader,
  fmt,
}: {
  emoji: string
  title: string
  metric: string
  leader: Leader | null
  fmt?: (n: number) => string
}) {
  const format = fmt ?? ((n: number) => String(n))
  return (
    <div className={`rounded-xl border px-4 py-3 text-center ${leader ? 'border-gold/40 bg-gold/10' : 'border-base-700 bg-base-850/40'}`}>
      <Emoji char={emoji} className={`mx-auto h-6 w-6 ${leader ? '' : 'opacity-40 grayscale'}`} />
      <p className="mt-1 font-display text-sm font-bold text-gold-light">{title}</p>
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{metric}</p>
      <p className="mt-1 truncate text-sm font-medium text-white">{leader ? leader.name : '-'}</p>
      {leader && <p className="text-xs font-semibold text-accent-light">{format(leader.value)}</p>}
    </div>
  )
}

/** Latest N games of one mode, clan-wide (same table shape as Home.tsx's own recent-games list). */
function LatestGamesSection({
  eyebrow,
  title,
  games,
  onOpenGame,
  t,
}: {
  eyebrow: string
  title: string
  games: { g: PlayerGame; memberNames: string[]; memberIds: string[] }[]
  onOpenGame: (gameId: string) => void
  t: TranslationShape
}) {
  const reactionsApi = useReactions(games.map(({ g }) => g.gameId))
  if (games.length === 0) return null
  return (
    <section className="space-y-4">
      <SectionHeading center eyebrow={eyebrow} title={title} />
      <div className="panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[660px] text-sm">
            <thead>
              <tr className="border-b border-base-700 text-xs uppercase tracking-wide text-slate-400">
                <th className="px-4 py-3 text-left font-semibold">{t.common.table.date}</th>
                <th className="px-4 py-3 text-left font-semibold">{t.common.table.player}</th>
                <th className="px-4 py-3 text-left font-semibold">{t.common.table.map}</th>
                <th className="px-4 py-3 text-right font-semibold">{t.common.table.duration}</th>
                <th className="px-4 py-3 text-right font-semibold">{t.common.table.result}</th>
                <th className="px-4 py-3 text-right font-semibold">{t.home.reactionButton}</th>
              </tr>
            </thead>
            <tbody>
              {games.map(({ g, memberNames, memberIds }) => (
                <tr
                  key={g.gameId}
                  onClick={() => onOpenGame(g.gameId)}
                  className="cursor-pointer border-b border-base-700/50 last:border-0 hover:bg-base-800/50"
                >
                  <td className="px-4 py-2.5 text-slate-400">{new Date(g.start).toLocaleDateString('en-GB')}</td>
                  <td className="px-4 py-2.5 text-white">{memberNames.join(', ')}</td>
                  <td className="px-4 py-2.5 text-slate-400">{g.map}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-400">{fmtDuration(g.durationSeconds)}</td>
                  <td
                    className={`px-4 py-2.5 text-right font-medium ${
                      g.result === 'victory' ? 'text-signal-green' : g.result === 'defeat' ? 'text-signal-red' : 'text-slate-500'
                    }`}
                  >
                    {g.result}
                  </td>
                  <ReactionCell gameId={g.gameId} memberIds={memberIds} api={reactionsApi} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

export default function Monthly({ variant }: { variant: Variant }) {
  const { profile } = useProfile()
  const { t } = useLanguage()
  const { data, loading, refreshing, error, lastUpdated, refresh } = useRoster(!!profile)
  const [month, setMonth] = useState<string>(currentMonthKey())
  // Stored standing of the chosen month in OpenFront's FFA ranking (rank, Elo, peak, first Elo of the month).
  const [ffaMonth, setFfaMonth] = useState<Record<string, { rank: number | null; elo: number; peak: number; first: number }> | null>(null)
  useEffect(() => {
    if (variant !== 'rffa') return
    let alive = true
    setFfaMonth(null)
    fetch(`/api/ffa-month?month=${month}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => alive && setFfaMonth(j?.entries ?? {}))
      .catch(() => alive && setFfaMonth({}))
    return () => {
      alive = false
    }
  }, [variant, month])
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [allRows, setAllRows] = useState(false)
  const [sortDir, setSortDir] = useState<1 | -1>(-1)
  const [openGame, setOpenGame] = useState<string | null>(null)
  // Elo for the SELECTED month specifically (see fetchMonthlyEloForAllMembers's
  // own comment) - re-fetched whenever the month tab changes, since it's the
  // one thing about this page that genuinely can't be derived from the
  // already-loaded roster/game data alone.
  const [monthlyElo, setMonthlyElo] = useState<Record<string, MonthlyEloPoint>>({})

  useEffect(() => {
    setSortKey(null)
    setSortDir(-1)
    setAllRows(false)
  }, [variant])

  useEffect(() => {
    let alive = true
    fetchMonthlyEloForAllMembers(month).then((result) => {
      if (alive) setMonthlyElo(result)
    })
    return () => {
      alive = false
    }
  }, [month])

  function onSortClick(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === -1 ? 1 : -1))
    } else {
      setSortKey(key)
      setSortDir(-1)
    }
  }

  const months = useMemo(() => (data ? availableMonths(data.members) : [currentMonthKey()]), [data])

  // Team monthly's "Win Score" column/title needs the real per-game clan
  // score, which isn't derivable from a PlayerGame alone (it depends on the
  // WHOLE clan's player count in that specific game, total players and team
  // count - the same ledger Home.tsx's Latest Games table already reads).
  // 2v2 is deliberately NOT included here - confirmed directly against
  // OpenFront's own real GET /public/clan/:tag/sessions endpoint that a 2v2
  // ranked game (mode: 'Team' same as a regular team lobby) is NOT counted
  // as a clan session by OpenFront's own backend, same exclusion
  // isClanScoreEligible (clanScore.ts) now applies everywhere else. Covers
  // both wins AND losses this month - a loss subtracts its score instead of
  // contributing nothing, so Win Score can go negative (see winScoreFor
  // below), which is the point: it should read as worse than not having
  // played at all, not the same as it.
  const isScoredMode = variant === 'team' ? isTeam : null
  const scoredGameIds = useMemo(() => {
    if (!isScoredMode) return [] as string[]
    const ids = new Set<string>()
    for (const m of data?.members ?? []) {
      for (const g of m.cynGames) {
        if (isScoredMode(g) && g.type !== 'Private' && (g.result === 'victory' || g.result === 'defeat') && monthKeyOf(g.start) === month) ids.add(g.gameId)
      }
    }
    return [...ids]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant, month, data])

  const [scoredLedger, setScoredLedger] = useState<Map<string, ClanScoreRow>>(new Map())
  useEffect(() => {
    if (scoredGameIds.length === 0) {
      setScoredLedger(new Map())
      return
    }
    fetchClanScoreLedger(scoredGameIds).then(setScoredLedger)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoredGameIds.join(',')])

  // OpenFront's own "CLANS" leaderboard entry (rolling 90-day window, 30-day half-life decay, refreshed by refresh-details.mjs) - the
  // one set of numbers meant to match the in-game clan leaderboard exactly. Shown on the Team page.
  const [clanLeaderboard, setClanLeaderboard] = useState<ClanLeaderboardEntry | null>(null)
  useEffect(() => {
    if (variant === 'team') fetchClanLeaderboardEntry().then(setClanLeaderboard)
  }, [variant])

  // How many [CYN] members played each scored game this month: the game's Win Score is shared between them.
  const cynPlayersByGame = useMemo(
    () => (isScoredMode ? cynPlayersByGameOf(data?.members ?? [], month, isScoredMode) : new Map<string, number>()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [variant, month, data],
  )

  if (!profile) return <RegistrationGate />

  const coop = data?.coopByGame ?? {}
  const members = data?.members ?? []
  const isCurrent = month === currentMonthKey()

  // Leader of a metric (highest value > 0), for the title cards.
  const leaderOf = (rows: { m: MemberStats; v: number }[]): Leader | null => {
    const best = rows.filter((r) => r.v > 0).sort((a, b) => b.v - a.v)[0]
    return best ? { name: best.m.name, value: best.v } : null
  }

  // Sum of the real clan Win Score (clanScore.ts) across this member's own
  // scored games this month (Team or 2v2, whichever `variant` is - see
  // isScoredMode/scoredGameIds/scoredLedger above). A win adds its score, a
  // loss SUBTRACTS it, so this can land negative - deliberately: a negative
  // Win Score is a real, worse-than-nothing result (someone who played and
  // lost, however badly) and has to outrank "-" (someone who didn't play a
  // single scored game this month) both in what's SHOWN and in how the
  // column SORTS. Returning `null` for "didn't play" and a real number
  // otherwise (same convention as colElo/colEloDelta already use) means the
  // existing `compareNullable` helper does the right thing for free: a null
  // always sorts to the bottom regardless of direction, so even the most
  // negative real score still outranks it. A game missing from the ledger
  // (not clan-score-eligible, or the cron hasn't reached it yet) simply
  // contributes 0 to the sum either way.
  // The game's score is shared: with two [CYN] players in it each gets half, so the members' sums add up to what the clan made.
  const winScoreFor = (m: MemberStats): number | null => (isScoredMode ? memberWinScore(m, month, isScoredMode, scoredLedger, cynPlayersByGame) : null)

  // What the clan made in total this month: every scored game counted once.
  const clanWinScoreTotal = (() => {
    let total = 0
    for (const [id, row] of scoredLedger) if (cynPlayersByGame.has(id)) total += row.won ? row.score : -row.score
    return Math.round(total * 100) / 100
  })()

  const title =
    variant === 'ffa'
      ? t.monthly.titleFfa
      : variant === 'rffa'
        ? 'FFA Ranked'
        : variant === 'team'
          ? t.monthly.titleTeam
          : variant === '1v1'
            ? t.monthly.title1v1
            : t.monthly.title2v2
  const isRanked = variant === '1v1' || variant === '2v2' || variant === 'rffa'
  const rules = rulesFor(variant, t)

  // The tables show their first 10 rows; the button after the table opens the rest (the table that is shown reports its size).
  let tableRows = 0
  const top = <T,>(list: T[]): T[] => {
    tableRows = list.length
    return allRows ? list : list.slice(0, 10)
  }

  return (
    <StatsShell
      leftExtra={
        variant === 'team' ? (
          <>
            <PointsPlannerWindow />
            <DecayForecastWindow />
          </>
        ) : undefined
      }
    >
      <section className="space-y-4">
        <SectionHeading center eyebrow={`${isRanked ? 'Ranked' : t.monthly.eyebrowPrefix} · ${monthLabel(month)}`} title={title} />

        <div className="flex items-center justify-center gap-2 text-sm">
          <label className="text-slate-400">{t.monthly.monthLabel}</label>
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded-lg border border-base-600 bg-base-800 px-3 py-1.5 text-white focus:border-accent focus:outline-none"
          >
            {months.map((mk) => (
              <option key={mk} value={mk}>
                {monthLabel(mk)}
                {mk === currentMonthKey() ? ` ${t.monthly.currentSuffix}` : ''}
              </option>
            ))}
          </select>
          {!isCurrent && <span className="text-xs text-slate-500">{t.monthly.archived}</span>}
        </div>

        {rules && (
          <div className="rounded-xl border border-base-600 bg-base-850/60 px-5 py-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-gold">{variant === 'team' ? t.monthly.rulesHeading : t.monthly.scoring}</p>
            <ul className="list-inside list-disc space-y-1 text-sm text-slate-400">{rules}</ul>
          </div>
        )}
      </section>

      <TagNotice />

      <section className="space-y-4">
        {loading && <Spinner label={t.common.loadingLiveData} />}
        {error && !data && <Card className="text-center text-sm text-signal-red">{t.monthly.loadError(error)}</Card>}

        {data && variant === 'rffa' && (() => {
          // Ranking-based for every month: rank and Elo come from the FFA board standing stored for that month.
          const standing = ffaMonth ?? {}
          const rows = members
            .map((m) => {
              const e = standing[m.publicId]
              return { m, rank: e?.rank ?? null, elo: e?.elo ?? null, peak: e?.peak ?? null, delta: e ? e.elo - e.first : null, rk: rankedFfaBucket(m.cynGames, month) }
            })
            .filter((x) => x.elo != null)
            .sort((a, b) => {
              if (sortKey === 'elo') return compareNullable(a.elo, b.elo, sortDir)
              if (sortKey === 'peak') return compareNullable(a.peak, b.peak, sortDir)
              if (sortKey === 'delta') return compareNullable(a.delta, b.delta, sortDir)
              if (sortKey === 'ranked') return compareNullable(a.rk.wins, b.rk.wins, sortDir)
              // Default: by the board rank (players who dropped off the board after the ones on it), then by Elo.
              return (a.rank ?? 1e9) - (b.rank ?? 1e9) || (b.elo ?? 0) - (a.elo ?? 0)
            })
          if (ffaMonth === null) return <Spinner label={t.common.loadingLiveData} />
          if (rows.length === 0) return <Card className="text-center text-sm text-slate-400">{t.monthly.ffaNoRanking}</Card>
          return (
            <>
              <div className="panel overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="sticky-cols w-full min-w-[520px] text-sm">
                    <thead>
                      <tr className="border-b border-base-700 text-xs uppercase tracking-wide text-slate-400">
                        <th className="px-3 py-3 text-left font-semibold">{t.monthly.colRank}</th>
                        <th className="px-3 py-3 text-left font-semibold">{t.monthly.colName}</th>
                        <SortTh label="FFA Elo" sortKey="elo" active={sortKey === 'elo'} dir={sortDir} onClick={onSortClick} />
                        <SortTh label={t.home.colPeak} sortKey="peak" active={sortKey === 'peak'} dir={sortDir} onClick={onSortClick} />
                        <SortTh label={t.monthly.colEloDelta} sortKey="delta" active={sortKey === 'delta'} dir={sortDir} onClick={onSortClick} />
                        <SortTh label="Ranked W/L" sortKey="ranked" active={sortKey === 'ranked'} dir={sortDir} onClick={onSortClick} />
                      </tr>
                    </thead>
                    <tbody>
                      {top(rows).map(({ m, rank, elo, peak, delta, rk }, i) => (
                        <tr key={m.publicId} className="border-b border-base-700/50 last:border-0 hover:bg-base-800/40">
                          <td className="px-3 py-3 font-display font-bold text-slate-500">{rank ?? i + 1}</td>
                          <td className="px-3 py-3"><MemberNameLink publicId={m.publicId} name={m.name} nationality={m.nationality} /></td>
                          <td className="px-3 py-3 text-right font-display text-lg font-bold tabular-nums text-gold-light">{elo}</td>
                          <td className="px-3 py-3 text-right tabular-nums text-slate-400">{peak}</td>
                          <td className={`px-3 py-3 text-right tabular-nums ${delta == null || delta === 0 ? 'text-slate-500' : delta > 0 ? 'text-signal-green' : 'text-signal-red'}`}>{delta == null ? '-' : delta > 0 ? `+${delta}` : delta}</td>
                          <td className="px-3 py-3 text-right tabular-nums text-slate-300">{rk.wins + rk.losses > 0 ? `${rk.wins}/${rk.losses}` : <span className="text-slate-600">-</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )
        })()}

        {data && variant === 'ffa' && (() => {
          const rows = members
            .map((m) => ({ m, r: ffaMonthly(m, month) }))
            .filter((x) => x.r.wins + x.r.losses > 0)
            .sort((a, b) => {
              if (sortKey === 'wins') return compareNullable(a.r.wins, b.r.wins, sortDir)
              if (sortKey === 'losses') return compareNullable(a.r.losses, b.r.losses, sortDir)
              if (sortKey === 'winRatePct') return compareNullable(a.r.winRatePct, b.r.winRatePct, sortDir)
              if (sortKey === 'winstreak') return compareNullable(a.r.winstreak, b.r.winstreak, sortDir)
              if (sortKey === 'avgKills') return compareNullable(a.r.avgKills, b.r.avgKills, sortDir)
              if (sortKey === 'points') return compareNullable(a.r.points, b.r.points, sortDir)
              return b.r.points - a.r.points || b.r.wins - a.r.wins
            })
          if (rows.length === 0) return <Card className="text-center text-sm text-slate-400">{t.monthly.ffaNoRanking}</Card>
          return (
            <>
            <div className="grid grid-cols-3 gap-3">
              <TitleCard emoji={EMOJI.pickaxe} title="Grinder" metric={t.monthly.colPoints} leader={leaderOf(rows.map((x) => ({ m: x.m, v: x.r.points })))} />
              <TitleCard emoji={EMOJI.bow} title={t.monthly.titlePredator} metric={t.monthly.metricAvgKills} leader={leaderOf(rows.map((x) => ({ m: x.m, v: x.r.avgKills ?? 0 })))} />
              <TitleCard emoji={EMOJI.bolt} title={t.monthly.titlePro} metric={t.monthly.metricWinStreak} leader={leaderOf(rows.map((x) => ({ m: x.m, v: x.r.winstreak })))} />
            </div>
            <div className="panel overflow-hidden">
              <div className="overflow-x-auto">
                <table className="sticky-cols w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="border-b border-base-700 text-xs uppercase tracking-wide text-slate-400">
                      <th className="px-3 py-3 text-left font-semibold">{t.monthly.colRank}</th>
                      <th className="px-3 py-3 text-left font-semibold">{t.monthly.colName}</th>
                      <SortTh label="Points" sortKey="points" active={sortKey === 'points'} dir={sortDir} onClick={onSortClick} />
                      <SortTh label={t.monthly.colWins} sortKey="wins" active={sortKey === 'wins'} dir={sortDir} onClick={onSortClick} />
                      <SortTh label={t.monthly.colLosses} sortKey="losses" active={sortKey === 'losses'} dir={sortDir} onClick={onSortClick} />
                      <SortTh label="Streak" sortKey="winstreak" active={sortKey === 'winstreak'} dir={sortDir} onClick={onSortClick} />
                      <SortTh label={t.monthly.colAvgKills} sortKey="avgKills" active={sortKey === 'avgKills'} dir={sortDir} onClick={onSortClick} />
                      <SortTh label={t.monthly.colWR} sortKey="winRatePct" active={sortKey === 'winRatePct'} dir={sortDir} onClick={onSortClick} />
                    </tr>
                  </thead>
                  <tbody>
                    {top(rows).map(({ m, r }, i) => (
                      <tr key={m.publicId} className="border-b border-base-700/50 last:border-0 hover:bg-base-800/40">
                        <td className="px-3 py-3 font-display font-bold text-slate-500">{i + 1}</td>
                        <td className="px-3 py-3"><MemberNameLink publicId={m.publicId} name={m.name} nationality={m.nationality} /></td>
                        <td className="px-3 py-3 text-right font-display text-lg font-bold tabular-nums text-gold-light">{r.points}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-signal-green">{r.wins}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-slate-400">{r.losses}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-slate-300">{r.winstreak || '-'}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-slate-300">{r.avgKills ?? <span className="text-slate-600">-</span>}</td>
                        <td className={`px-3 py-3 text-right tabular-nums ${winRateClass(r.winRatePct)}`}>{r.winRatePct}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            </>
          )
        })()}

        {data && variant === 'team' && (() => {
          const rows = members
            .map((m) => ({ m, r: teamMonthly(m, month, coop), winScore: winScoreFor(m) }))
            .sort((a, b) => {
              if (sortKey === 'wins') return compareNullable(a.r.wins, b.r.wins, sortDir)
              if (sortKey === 'losses') return compareNullable(a.r.losses, b.r.losses, sortDir)
              if (sortKey === 'winRatePct') return compareNullable(a.r.winRatePct, b.r.winRatePct, sortDir)
              if (sortKey === 'kills') return compareNullable(a.r.kills, b.r.kills, sortDir)
              if (sortKey === 'avgGold') return compareNullable(a.r.avgGold, b.r.avgGold, sortDir)
              if (sortKey === 'winScore') return compareNullable(a.winScore, b.winScore, sortDir)
              const winScoreDesc = compareNullable(a.winScore, b.winScore, -1)
              return winScoreDesc !== 0 ? winScoreDesc : b.r.wins - a.r.wins
            })
          return (
            <>
              <div className="grid grid-cols-3 gap-3">
                <TitleCard emoji={EMOJI.anchor} title={t.monthly.titleMarine} metric={t.monthly.metricGoldMin} leader={leaderOf(rows.map((x) => ({ m: x.m, v: x.r.avgGold ?? 0 })))} fmt={fmtGold} />
                <TitleCard emoji={EMOJI.blast} title={t.monthly.titleDestroyer} metric={t.monthly.metricKills} leader={leaderOf(rows.map((x) => ({ m: x.m, v: x.r.kills ?? 0 })))} />
                <TitleCard
                  emoji={EMOJI.wrench}
                  title={t.monthly.titleTeamGrinder}
                  metric={t.monthly.metricHighestWinScore}
                  leader={leaderOf(rows.map((x) => ({ m: x.m, v: x.winScore ?? 0 })))}
                  fmt={(n) => n.toFixed(2)}
                />
              </div>
              {clanLeaderboard && (
                <div className="space-y-3">
                  <SectionHeading center eyebrow="OpenFront Clan Leaderboard" title="Last 90 Days" />
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <StatCard label="Games" value={clanLeaderboard.games} accent="plain" />
                    <StatCard label="Win Score" value={clanLeaderboard.weightedWins.toFixed(1)} accent="gold" />
                    <StatCard label="Loss Score" value={clanLeaderboard.weightedLosses.toFixed(1)} accent="plain" />
                    <StatCard label="Win/Loss Ratio" value={clanLeaderboard.weightedWLRatio.toFixed(2)} accent="gold" />
                  </div>
                </div>
              )}
              <Card className="text-center">
                <p className="text-xs font-semibold uppercase tracking-widest text-gold">CYN Win Score · {monthLabel(month)}</p>
                <p className={`mt-1 font-display text-3xl font-bold ${clanWinScoreTotal < 0 ? 'text-signal-red' : 'text-accent-light'}`}>{clanWinScoreTotal.toFixed(2)}</p>
                <p className="mt-1 text-xs text-slate-500">A game's Win Score is split between the [CYN] players in it (two players: half each), so the members add up to the clan's total.</p>
              </Card>
              <div className="panel overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="sticky-cols w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="border-b border-base-700 text-xs uppercase tracking-wide text-slate-400">
                        <th className="px-3 py-3 text-left font-semibold">{t.monthly.colRank}</th>
                        <th className="px-3 py-3 text-left font-semibold">{t.monthly.colName}</th>
                        <SortTh label={t.monthly.colWins} sortKey="wins" active={sortKey === 'wins'} dir={sortDir} onClick={onSortClick} />
                        <SortTh label={t.monthly.colLosses} sortKey="losses" active={sortKey === 'losses'} dir={sortDir} onClick={onSortClick} />
                        <SortTh label={t.monthly.colKills} sortKey="kills" active={sortKey === 'kills'} dir={sortDir} onClick={onSortClick} />
                        <SortTh label={t.monthly.colGoldMin} sortKey="avgGold" active={sortKey === 'avgGold'} dir={sortDir} onClick={onSortClick} />
                        <SortTh label={t.monthly.colWR} sortKey="winRatePct" active={sortKey === 'winRatePct'} dir={sortDir} onClick={onSortClick} />
                        <SortTh label="Win Score" sortKey="winScore" active={sortKey === 'winScore'} dir={sortDir} onClick={onSortClick} />
                      </tr>
                    </thead>
                    <tbody>
                      {top(rows).map(({ m, r, winScore }, i) => (
                        <tr key={m.publicId} className="border-b border-base-700/50 last:border-0 hover:bg-base-800/40">
                          <td className="px-3 py-3 font-display font-bold text-slate-500">{i + 1}</td>
                          <td className="px-3 py-3"><MemberNameLink publicId={m.publicId} name={m.name} nationality={m.nationality} /></td>
                          <td className="px-3 py-3 text-right tabular-nums text-signal-green">{r.wins}</td>
                          <td className="px-3 py-3 text-right tabular-nums text-slate-400">{r.losses}</td>
                          <td className="px-3 py-3 text-right tabular-nums text-slate-300">{r.kills ?? '-'}</td>
                          <td className="px-3 py-3 text-right tabular-nums text-gold-light">{fmtGold(r.avgGold)}</td>
                          <td className={`px-3 py-3 text-right tabular-nums ${winRateClass(r.winRatePct)}`}>{r.winRatePct}%</td>
                          <td className={`px-3 py-3 text-right font-display text-lg font-bold ${winScore != null && winScore < 0 ? 'text-signal-red' : 'text-accent-light'}`}>
                            {winScore == null ? '-' : winScore.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )
        })()}

        {data && variant === '1v1' && (() => {
          const rows = members
            .map((m) => ({
              m,
              b: oneVoneBucket(m.cynGames, month),
              wr: winRate(oneVoneBucket(m.cynGames, month).wins, oneVoneBucket(m.cynGames, month).losses),
              elo: monthlyElo[m.publicId]?.elo ?? null,
              eloDelta: monthlyElo[m.publicId]?.eloDelta ?? null,
            }))
            .sort((a, b) => {
              if (sortKey === 'wins') return compareNullable(a.b.wins, b.b.wins, sortDir)
              if (sortKey === 'losses') return compareNullable(a.b.losses, b.b.losses, sortDir)
              if (sortKey === 'winRatePct') return compareNullable(a.wr, b.wr, sortDir)
              if (sortKey === 'elo') return compareNullable(a.elo, b.elo, sortDir)
              if (sortKey === 'eloDelta') return compareNullable(a.eloDelta, b.eloDelta, sortDir)
              return (b.eloDelta ?? -9999) - (a.eloDelta ?? -9999) || b.b.wins - a.b.wins
            })
          return (
            <div className="panel overflow-hidden">
              <div className="overflow-x-auto">
                <table className="sticky-cols w-full min-w-[600px] text-sm">
                  <thead>
                    <tr className="border-b border-base-700 text-xs uppercase tracking-wide text-slate-400">
                      <th className="px-4 py-3 text-left font-semibold">{t.monthly.colRank}</th>
                      <th className="px-4 py-3 text-left font-semibold">{t.monthly.colName}</th>
                      <SortTh label={t.monthly.colWins} sortKey="wins" active={sortKey === 'wins'} dir={sortDir} onClick={onSortClick} />
                      <SortTh label={t.monthly.colLosses} sortKey="losses" active={sortKey === 'losses'} dir={sortDir} onClick={onSortClick} />
                      <SortTh label={t.monthly.colWR} sortKey="winRatePct" active={sortKey === 'winRatePct'} dir={sortDir} onClick={onSortClick} />
                      <SortTh label={t.monthly.colCurrentElo} sortKey="elo" active={sortKey === 'elo'} dir={sortDir} onClick={onSortClick} />
                      <SortTh label={t.monthly.colEloDelta} sortKey="eloDelta" active={sortKey === 'eloDelta'} dir={sortDir} onClick={onSortClick} />
                    </tr>
                  </thead>
                  <tbody>
                    {top(rows).map(({ m, b, wr, elo, eloDelta }, i) => (
                      <tr key={m.publicId} className="border-b border-base-700/50 last:border-0 hover:bg-base-800/40">
                        <td className="px-4 py-3 font-display font-bold text-slate-500">{i + 1}</td>
                        <td className="px-4 py-3"><MemberNameLink publicId={m.publicId} name={m.name} nationality={m.nationality} /></td>
                        <td className="px-4 py-3 text-right tabular-nums text-signal-green">{b.wins}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-400">{b.losses}</td>
                        <td className={`px-4 py-3 text-right tabular-nums ${winRateClass(wr)}`}>{wr}%</td>
                        <td className="px-4 py-3 text-right tabular-nums text-gold-light">{elo ?? <span className="text-slate-600">-</span>}</td>
                        <td className="px-4 py-3 text-right font-display font-bold"><EloDelta delta={eloDelta} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })()}

        {data && variant === '2v2' && (() => {
          const rows = members
            .map((m) => ({
              m,
              b: twoVTwoBucket(m.cynGames, month),
              wr: winRate(twoVTwoBucket(m.cynGames, month).wins, twoVTwoBucket(m.cynGames, month).losses),
              elo: monthlyElo[m.publicId]?.elo2v2 ?? null,
              eloDelta: monthlyElo[m.publicId]?.eloDelta2v2 ?? null,
            }))
            .sort((a, b) => {
              if (sortKey === 'wins') return compareNullable(a.b.wins, b.b.wins, sortDir)
              if (sortKey === 'losses') return compareNullable(a.b.losses, b.b.losses, sortDir)
              if (sortKey === 'winRatePct') return compareNullable(a.wr, b.wr, sortDir)
              if (sortKey === 'elo') return compareNullable(a.elo, b.elo, sortDir)
              if (sortKey === 'eloDelta') return compareNullable(a.eloDelta, b.eloDelta, sortDir)
              return (b.eloDelta ?? -9999) - (a.eloDelta ?? -9999) || b.b.wins - a.b.wins
            })
          return (
            <div className="panel overflow-hidden">
              <div className="overflow-x-auto">
                <table className="sticky-cols w-full min-w-[600px] text-sm">
                  <thead>
                    <tr className="border-b border-base-700 text-xs uppercase tracking-wide text-slate-400">
                      <th className="px-4 py-3 text-left font-semibold">{t.monthly.colRank}</th>
                      <th className="px-4 py-3 text-left font-semibold">{t.monthly.colName}</th>
                      <SortTh label={t.monthly.colWins} sortKey="wins" active={sortKey === 'wins'} dir={sortDir} onClick={onSortClick} />
                      <SortTh label={t.monthly.colLosses} sortKey="losses" active={sortKey === 'losses'} dir={sortDir} onClick={onSortClick} />
                      <SortTh label={t.monthly.colWR} sortKey="winRatePct" active={sortKey === 'winRatePct'} dir={sortDir} onClick={onSortClick} />
                      <SortTh label={t.monthly.colCurrentElo} sortKey="elo" active={sortKey === 'elo'} dir={sortDir} onClick={onSortClick} />
                      <SortTh label={t.monthly.colEloDelta} sortKey="eloDelta" active={sortKey === 'eloDelta'} dir={sortDir} onClick={onSortClick} />
                    </tr>
                  </thead>
                  <tbody>
                    {top(rows).map(({ m, b, wr, elo, eloDelta }, i) => (
                      <tr key={m.publicId} className="border-b border-base-700/50 last:border-0 hover:bg-base-800/40">
                        <td className="px-4 py-3 font-display font-bold text-slate-500">{i + 1}</td>
                        <td className="px-4 py-3"><MemberNameLink publicId={m.publicId} name={m.name} nationality={m.nationality} /></td>
                        <td className="px-4 py-3 text-right tabular-nums text-signal-green">{b.wins}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-400">{b.losses}</td>
                        <td className={`px-4 py-3 text-right tabular-nums ${winRateClass(wr)}`}>{wr}%</td>
                        <td className="px-4 py-3 text-right tabular-nums text-gold-light">{elo ?? <span className="text-slate-600">-</span>}</td>
                        <td className="px-4 py-3 text-right font-display font-bold"><EloDelta delta={eloDelta} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })()}

        {data && (
          <>
            {tableRows > 10 && (
              <div className="flex justify-center">
                <button type="button" onClick={() => setAllRows((v) => !v)} className="btn-ghost text-sm">
                  {allRows ? t.common.showTopOnly(10) : t.common.showAll(tableRows)}
                </button>
              </div>
            )}
            <LastUpdated ts={lastUpdated} onRefresh={refresh} refreshing={refreshing} />
            {variant === 'team' && (
              <p className="text-center text-xs text-slate-500">{t.monthly.killsNote(true)}</p>
            )}
          </>
        )}
      </section>

      {data && (
        <LatestGamesSection
          eyebrow={t.monthly.eyebrowPrefix}
          title={t.monthly.latestModeGamesTitle(
            variant === 'ffa' || variant === 'rffa' ? 'FFA' : variant === 'team' ? t.monthly.titleTeam : variant === '1v1' ? '1v1' : '2v2',
          )}
          games={latestModeGames(
            members,
            month,
            variant === 'ffa' || variant === 'rffa' ? isFfa : variant === 'team' ? isTeam : variant === '1v1' ? is1v1 : is2v2,
          )}
          onOpenGame={setOpenGame}
          t={t}
        />
      )}

      <GameDetailModal gameId={openGame} onClose={() => setOpenGame(null)} />
    </StatsShell>
  )
}
