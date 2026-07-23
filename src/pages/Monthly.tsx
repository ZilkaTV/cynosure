import { useEffect, useMemo, useState } from 'react'
import { CLAN_TAG } from '../config'
import { useProfile } from '../lib/useProfile'
import { useRoster } from '../lib/useRoster'
import { RegistrationGate, StatsShell, TagNotice } from '../components/StatsShell'
import GameDetailModal from '../components/GameDetailModal'
import { Card, EloDelta, LastUpdated, MemberNameLink, SectionHeading, Spinner } from '../components/ui'
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
  monthKeyOf,
  monthLabel,
  oneVoneBucket,
  teamMonthly,
  winRate,
  type MemberStats,
} from '../lib/stats'

function fmtDuration(s: number): string {
  const m = Math.floor(s / 60)
  return `${m}m ${String(s % 60).padStart(2, '0')}s`
}

const LATEST_GAMES_COUNT = 10

/** Latest N distinct clan games of one mode within a given month, deduped across members (same pattern as Home.tsx's recent-games list). */
function latestModeGames(members: MemberStats[], month: string, isMode: (g: PlayerGame) => boolean) {
  const byGameId = new Map<string, { g: PlayerGame; memberNames: string[] }>()
  for (const m of members) {
    for (const g of m.cynGames) {
      if (g.type === 'Private' || !isMode(g) || monthKeyOf(g.start) !== month) continue
      const existing = byGameId.get(g.gameId)
      if (existing) existing.memberNames.push(m.name)
      else byGameId.set(g.gameId, { g, memberNames: [m.name] })
    }
  }
  return [...byGameId.values()]
    .sort((a, b) => new Date(b.g.start).getTime() - new Date(a.g.start).getTime())
    .slice(0, LATEST_GAMES_COUNT)
}

type Variant = 'ffa' | 'team' | '1v1'

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
  games: { g: PlayerGame; memberNames: string[] }[]
  onOpenGame: (gameId: string) => void
  t: TranslationShape
}) {
  if (games.length === 0) return null
  return (
    <section className="space-y-4">
      <SectionHeading center eyebrow={eyebrow} title={title} />
      <div className="panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-base-700 text-xs uppercase tracking-wide text-slate-400">
                <th className="px-4 py-3 text-left font-semibold">{t.common.table.date}</th>
                <th className="px-4 py-3 text-left font-semibold">{t.common.table.player}</th>
                <th className="px-4 py-3 text-left font-semibold">{t.common.table.map}</th>
                <th className="px-4 py-3 text-right font-semibold">{t.common.table.duration}</th>
                <th className="px-4 py-3 text-right font-semibold">{t.common.table.result}</th>
              </tr>
            </thead>
            <tbody>
              {games.map(({ g, memberNames }) => (
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
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<1 | -1>(-1)
  const [openGame, setOpenGame] = useState<string | null>(null)

  useEffect(() => {
    setSortKey(null)
    setSortDir(-1)
  }, [variant])

  function onSortClick(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === -1 ? 1 : -1))
    } else {
      setSortKey(key)
      setSortDir(-1)
    }
  }

  const months = useMemo(() => (data ? availableMonths(data.members) : [currentMonthKey()]), [data])

  if (!profile) return <RegistrationGate />

  const coop = data?.coopByGame ?? {}
  const members = data?.members ?? []
  const isCurrent = month === currentMonthKey()

  // Leader of a metric (highest value > 0), for the title cards.
  const leaderOf = (rows: { m: MemberStats; v: number }[]): Leader | null => {
    const best = rows.filter((r) => r.v > 0).sort((a, b) => b.v - a.v)[0]
    return best ? { name: best.m.name, value: best.v } : null
  }

  const title = variant === 'ffa' ? t.monthly.titleFfa : variant === 'team' ? t.monthly.titleTeam : t.monthly.title1v1
  const rules = rulesFor(variant, t)

  return (
    <StatsShell>
      <section className="space-y-4">
        <SectionHeading center eyebrow={`${t.monthly.eyebrowPrefix} · ${monthLabel(month)}`} title={title} />

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
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-gold">{t.monthly.scoring}</p>
            <ul className="list-inside list-disc space-y-1 text-sm text-slate-400">{rules}</ul>
          </div>
        )}
      </section>

      <TagNotice />

      <section className="space-y-4">
        {loading && <Spinner label={t.common.loadingLiveData} />}
        {error && !data && <Card className="text-center text-sm text-signal-red">{t.monthly.loadError(error)}</Card>}

        {data && variant === 'ffa' && (() => {
          const rows = members
            .map((m) => ({ m, r: ffaMonthly(m, month) }))
            .sort((a, b) => {
              if (sortKey === 'wins') return compareNullable(a.r.wins, b.r.wins, sortDir)
              if (sortKey === 'losses') return compareNullable(a.r.losses, b.r.losses, sortDir)
              if (sortKey === 'winRatePct') return compareNullable(a.r.winRatePct, b.r.winRatePct, sortDir)
              if (sortKey === 'winstreak') return compareNullable(a.r.winstreak, b.r.winstreak, sortDir)
              if (sortKey === 'avgKills') return compareNullable(a.r.avgKills, b.r.avgKills, sortDir)
              if (sortKey === 'points') return compareNullable(a.r.points, b.r.points, sortDir)
              return b.r.points - a.r.points || b.r.wins - a.r.wins
            })
          return (
            <>
              <div className="grid grid-cols-3 gap-3">
                <TitleCard emoji={EMOJI.bow} title={t.monthly.titlePredator} metric={t.monthly.metricAvgKills} leader={leaderOf(rows.map((x) => ({ m: x.m, v: x.r.avgKills ?? 0 })))} />
                <TitleCard emoji={EMOJI.bolt} title={t.monthly.titlePro} metric={t.monthly.metricWinStreak} leader={leaderOf(rows.map((x) => ({ m: x.m, v: x.r.winstreak })))} />
                <TitleCard emoji={EMOJI.pickaxe} title={t.monthly.titleGrinder} metric={t.monthly.metricMostPoints} leader={leaderOf(rows.map((x) => ({ m: x.m, v: x.r.points })))} />
              </div>
              <div className="panel overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="border-b border-base-700 text-xs uppercase tracking-wide text-slate-400">
                        <th className="px-3 py-3 text-left font-semibold">{t.monthly.colRank}</th>
                        <th className="px-3 py-3 text-left font-semibold">{t.monthly.colName}</th>
                        <SortTh label={t.monthly.colWins} sortKey="wins" active={sortKey === 'wins'} dir={sortDir} onClick={onSortClick} />
                        <SortTh label={t.monthly.colLosses} sortKey="losses" active={sortKey === 'losses'} dir={sortDir} onClick={onSortClick} />
                        <SortTh label={t.monthly.colWR} sortKey="winRatePct" active={sortKey === 'winRatePct'} dir={sortDir} onClick={onSortClick} />
                        <SortTh label={t.monthly.colStreak} sortKey="winstreak" active={sortKey === 'winstreak'} dir={sortDir} onClick={onSortClick} />
                        <SortTh label={t.monthly.colAvgKills} sortKey="avgKills" active={sortKey === 'avgKills'} dir={sortDir} onClick={onSortClick} />
                        <SortTh label={t.monthly.colPoints} sortKey="points" active={sortKey === 'points'} dir={sortDir} onClick={onSortClick} />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(({ m, r }, i) => (
                        <tr key={m.publicId} className="border-b border-base-700/50 last:border-0 hover:bg-base-800/40">
                          <td className="px-3 py-3 font-display font-bold text-slate-500">{i + 1}</td>
                          <td className="px-3 py-3"><MemberNameLink publicId={m.publicId} name={m.name} nationality={m.nationality} /></td>
                          <td className="px-3 py-3 text-right tabular-nums text-signal-green">{r.wins}</td>
                          <td className="px-3 py-3 text-right tabular-nums text-slate-400">{r.losses}</td>
                          <td className="px-3 py-3 text-right tabular-nums text-slate-300">{r.winRatePct}%</td>
                          <td className="px-3 py-3 text-right tabular-nums text-slate-300">{r.winstreak}</td>
                          <td className="px-3 py-3 text-right tabular-nums text-slate-300">{r.avgKills ?? '-'}</td>
                          <td className="px-3 py-3 text-right font-display text-lg font-bold text-accent-light">{r.points}</td>
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
            .map((m) => ({ m, r: teamMonthly(m, month, coop) }))
            .sort((a, b) => {
              if (sortKey === 'wins') return compareNullable(a.r.wins, b.r.wins, sortDir)
              if (sortKey === 'losses') return compareNullable(a.r.losses, b.r.losses, sortDir)
              if (sortKey === 'winRatePct') return compareNullable(a.r.winRatePct, b.r.winRatePct, sortDir)
              if (sortKey === 'kills') return compareNullable(a.r.kills, b.r.kills, sortDir)
              if (sortKey === 'avgGold') return compareNullable(a.r.avgGold, b.r.avgGold, sortDir)
              if (sortKey === 'points') return compareNullable(a.r.points, b.r.points, sortDir)
              return b.r.points - a.r.points || b.r.wins - a.r.wins
            })
          return (
            <>
              <div className="grid grid-cols-3 gap-3">
                <TitleCard emoji={EMOJI.anchor} title={t.monthly.titleMarine} metric={t.monthly.metricGoldMin} leader={leaderOf(rows.map((x) => ({ m: x.m, v: x.r.avgGold ?? 0 })))} fmt={fmtGold} />
                <TitleCard emoji={EMOJI.blast} title={t.monthly.titleDestroyer} metric={t.monthly.metricKills} leader={leaderOf(rows.map((x) => ({ m: x.m, v: x.r.kills ?? 0 })))} />
                <TitleCard emoji={EMOJI.wrench} title={t.monthly.titleTeamGrinder} metric={t.monthly.metricMostPoints} leader={leaderOf(rows.map((x) => ({ m: x.m, v: x.r.points })))} />
              </div>
              <div className="panel overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="border-b border-base-700 text-xs uppercase tracking-wide text-slate-400">
                        <th className="px-3 py-3 text-left font-semibold">{t.monthly.colRank}</th>
                        <th className="px-3 py-3 text-left font-semibold">{t.monthly.colName}</th>
                        <SortTh label={t.monthly.colWins} sortKey="wins" active={sortKey === 'wins'} dir={sortDir} onClick={onSortClick} />
                        <SortTh label={t.monthly.colLosses} sortKey="losses" active={sortKey === 'losses'} dir={sortDir} onClick={onSortClick} />
                        <SortTh label={t.monthly.colWR} sortKey="winRatePct" active={sortKey === 'winRatePct'} dir={sortDir} onClick={onSortClick} />
                        <SortTh label={t.monthly.colKills} sortKey="kills" active={sortKey === 'kills'} dir={sortDir} onClick={onSortClick} />
                        <SortTh label={t.monthly.colGoldMin} sortKey="avgGold" active={sortKey === 'avgGold'} dir={sortDir} onClick={onSortClick} />
                        <SortTh label={t.monthly.colPoints} sortKey="points" active={sortKey === 'points'} dir={sortDir} onClick={onSortClick} />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(({ m, r }, i) => (
                        <tr key={m.publicId} className="border-b border-base-700/50 last:border-0 hover:bg-base-800/40">
                          <td className="px-3 py-3 font-display font-bold text-slate-500">{i + 1}</td>
                          <td className="px-3 py-3"><MemberNameLink publicId={m.publicId} name={m.name} nationality={m.nationality} /></td>
                          <td className="px-3 py-3 text-right tabular-nums text-signal-green">{r.wins}</td>
                          <td className="px-3 py-3 text-right tabular-nums text-slate-400">{r.losses}</td>
                          <td className="px-3 py-3 text-right tabular-nums text-slate-300">{r.winRatePct}%</td>
                          <td className="px-3 py-3 text-right tabular-nums text-slate-300">{r.kills ?? '-'}</td>
                          <td className="px-3 py-3 text-right tabular-nums text-gold-light">{fmtGold(r.avgGold)}</td>
                          <td className="px-3 py-3 text-right font-display text-lg font-bold text-accent-light">{r.points}</td>
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
            .map((m) => ({ m, b: oneVoneBucket(m.cynGames, month), wr: winRate(oneVoneBucket(m.cynGames, month).wins, oneVoneBucket(m.cynGames, month).losses) }))
            .sort((a, b) => {
              if (sortKey === 'wins') return compareNullable(a.b.wins, b.b.wins, sortDir)
              if (sortKey === 'losses') return compareNullable(a.b.losses, b.b.losses, sortDir)
              if (sortKey === 'winRatePct') return compareNullable(a.wr, b.wr, sortDir)
              if (sortKey === 'elo') return compareNullable(a.m.elo, b.m.elo, sortDir)
              if (sortKey === 'eloDelta') return compareNullable(a.m.eloMonthDelta, b.m.eloMonthDelta, sortDir)
              return (b.m.eloMonthDelta ?? -9999) - (a.m.eloMonthDelta ?? -9999) || b.b.wins - a.b.wins
            })
          return (
            <div className="panel overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px] text-sm">
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
                    {rows.map(({ m, b, wr }, i) => (
                      <tr key={m.publicId} className="border-b border-base-700/50 last:border-0 hover:bg-base-800/40">
                        <td className="px-4 py-3 font-display font-bold text-slate-500">{i + 1}</td>
                        <td className="px-4 py-3"><MemberNameLink publicId={m.publicId} name={m.name} nationality={m.nationality} /></td>
                        <td className="px-4 py-3 text-right tabular-nums text-signal-green">{b.wins}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-400">{b.losses}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-300">{wr}%</td>
                        <td className="px-4 py-3 text-right tabular-nums text-gold-light">{m.elo ?? <span className="text-slate-600">-</span>}</td>
                        <td className="px-4 py-3 text-right font-display font-bold"><EloDelta delta={m.eloMonthDelta} /></td>
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
            <LastUpdated ts={lastUpdated} onRefresh={refresh} refreshing={refreshing} />
            {(variant === 'ffa' || variant === 'team') && (
              <p className="text-center text-xs text-slate-500">{t.monthly.killsNote(variant === 'team')}</p>
            )}
          </>
        )}
      </section>

      {data && (
        <LatestGamesSection
          eyebrow={t.monthly.eyebrowPrefix}
          title={t.monthly.latestModeGamesTitle(variant === 'ffa' ? 'FFA' : variant === 'team' ? t.monthly.titleTeam : '1v1')}
          games={latestModeGames(members, month, variant === 'ffa' ? isFfa : variant === 'team' ? isTeam : is1v1)}
          onOpenGame={setOpenGame}
          t={t}
        />
      )}

      <GameDetailModal gameId={openGame} onClose={() => setOpenGame(null)} />
    </StatsShell>
  )
}
