import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useProfile } from '../lib/useProfile'
import { RegistrationGate, StatsShell } from '../components/StatsShell'
import { SectionHeading, Spinner } from '../components/ui'
import { fetchClanMembers, type ClanMember, type WinLoss } from '../lib/clanMembers'
import { fetchRegistered } from '../lib/profiles'
import { fetchRankedMap } from '../lib/openfront'
import { cleanDisplayName } from '../lib/displayName'
import { useLanguage } from '../i18n/LanguageContext'

type Filter = 'all' | 'registered' | 'unregistered' | 'ranked'
type SortKey = 'name' | 'role' | 'joined' | 'games' | 'wins' | 'ranked' | 'elo'

const ROLE_ORDER = { leader: 0, officer: 1, member: 2 } as const
const games = (x: WinLoss) => x.w + x.l

/** The whole clan as OpenFront lists it - including members who never registered on this site. */
export default function Clan() {
  const { profile } = useProfile()
  const { t } = useLanguage()
  const [members, setMembers] = useState<ClanMember[] | null>(null)
  const [error, setError] = useState(false)
  const [registered, setRegistered] = useState<Map<string, string>>(new Map())
  const [elo, setElo] = useState<Record<string, number>>({})
  const [filter, setFilter] = useState<Filter>('all')
  const [sortKey, setSortKey] = useState<SortKey>('games')
  const [dir, setDir] = useState<1 | -1>(-1)

  useEffect(() => {
    if (!profile) return
    fetchClanMembers().then(setMembers).catch(() => setError(true))
    fetchRegistered()
      .then((list) => setRegistered(new Map(list.map((p) => [p.openfront_id, p.in_game_name]))))
      .catch(() => {})
    fetchRankedMap()
      .then((r) => setElo(Object.fromEntries(Object.entries(r.oneVOne).map(([id, e]) => [id, e.elo]))))
      .catch(() => {})
  }, [profile])

  const rows = useMemo(() => {
    const list = (members ?? []).filter((m) => {
      if (filter === 'registered') return registered.has(m.id)
      if (filter === 'unregistered') return !registered.has(m.id)
      if (filter === 'ranked') return games(m.ranked) > 0
      return true
    })
    const val = (m: ClanMember): number | string => {
      switch (sortKey) {
        case 'name':
          return cleanDisplayName(m.name ?? '').toLowerCase()
        case 'role':
          return ROLE_ORDER[m.role] ?? 3
        case 'joined':
          return m.joinedAt
        case 'wins':
          return m.total.w
        case 'ranked':
          return games(m.ranked)
        case 'elo':
          return elo[m.id] ?? -1
        default:
          return games(m.total)
      }
    }
    return [...list].sort((a, b) => {
      const av = val(a)
      const bv = val(b)
      const c = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv))
      return c * dir
    })
  }, [members, registered, elo, filter, sortKey, dir])

  if (!profile) return <RegistrationGate />
  if (error) return <p className="py-10 text-center text-slate-400">{t.clanPage.error}</p>
  if (!members) return <Spinner label={t.common.loadingLiveData} />

  const registeredCount = members.filter((m) => registered.has(m.id)).length
  const clanIds = new Set(members.map((m) => m.id))
  const leftClan = [...registered].filter(([id]) => !clanIds.has(id)).map(([, name]) => name)

  const sortBy = (key: SortKey) => {
    if (key === sortKey) setDir((d) => (d === 1 ? -1 : 1))
    else {
      setSortKey(key)
      setDir(key === 'name' || key === 'role' ? 1 : -1)
    }
  }
  const th = (key: SortKey, label: string, right = false) => (
    <th className={`px-4 py-3 font-semibold ${right ? 'text-right' : 'text-left'}`}>
      <button onClick={() => sortBy(key)} className="uppercase tracking-wide hover:text-white">
        {label}
        {sortKey === key ? (dir === 1 ? ' ▲' : ' ▼') : ''}
      </button>
    </th>
  )
  const filters: { key: Filter; label: string }[] = [
    { key: 'all', label: t.clanPage.filterAll },
    { key: 'registered', label: t.clanPage.filterRegistered },
    { key: 'unregistered', label: t.clanPage.filterUnregistered },
    { key: 'ranked', label: t.clanPage.filterRanked },
  ]
  const roleLabel = { leader: t.clanPage.roleLeader, officer: t.clanPage.roleOfficer, member: t.clanPage.roleMember }

  return (
    <StatsShell>
      <section className="space-y-4">
        <SectionHeading center eyebrow={t.clanPage.eyebrow} title={t.clanPage.title} />
        <p className="text-center text-sm text-slate-400">{t.clanPage.summary(members.length, registeredCount, members.length - registeredCount)}</p>
        <div className="flex flex-wrap justify-center gap-2">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
                filter === f.key ? 'bg-accent text-white' : 'bg-base-800 text-slate-400 hover:bg-base-700 hover:text-slate-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-base-700 text-xs text-slate-400">
                  {th('name', t.clanPage.colPlayer)}
                  {th('role', t.clanPage.colRole)}
                  {th('joined', t.clanPage.colJoined)}
                  {th('games', t.clanPage.colGames, true)}
                  {th('wins', t.clanPage.colWins, true)}
                  {th('ranked', t.clanPage.colRanked, true)}
                  {th('elo', t.clanPage.col1v1Elo, true)}
                  <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide">{t.clanPage.colStatus}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => {
                  const isReg = registered.has(m.id)
                  const display = cleanDisplayName(m.name ?? m.id)
                  return (
                    <tr key={m.id} className="border-b border-base-700/50 last:border-0 hover:bg-base-800/50">
                      <td className="px-4 py-2.5 text-white">
                        {isReg ? (
                          <Link to={`/member/${m.id}`} className="font-medium hover:text-accent-light">
                            {display}
                          </Link>
                        ) : (
                          display
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-slate-300">{roleLabel[m.role] ?? m.role}</td>
                      <td className="px-4 py-2.5 text-slate-400">{new Date(m.joinedAt).toLocaleDateString('en-GB')}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-300">{games(m.total) || '-'}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-300">{games(m.total) ? m.total.w : '-'}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-300" title={m.r1v1.w + m.r1v1.l > 0 ? `1v1: ${m.r1v1.w}-${m.r1v1.l}` : undefined}>
                        {games(m.ranked) ? `${m.ranked.w}-${m.ranked.l}` : '-'}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-gold-light">{elo[m.id] ?? <span className="text-slate-600">-</span>}</td>
                      <td className="px-4 py-2.5">
                        {isReg ? (
                          <span className="text-xs text-signal-green">{t.clanPage.registered}</span>
                        ) : (
                          <Link to="/register" className="rounded-full bg-base-700/60 px-2.5 py-0.5 text-xs text-slate-400 hover:text-white">
                            {t.clanPage.notRegistered}
                          </Link>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
        {leftClan.length > 0 && <p className="text-center text-xs text-slate-500">{t.clanPage.leftClan(leftClan.join(', '))}</p>}
        <p className="text-center text-xs text-slate-500">{t.clanPage.note}</p>
      </section>
    </StatsShell>
  )
}
