import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLanguage } from '../i18n/LanguageContext'
import { useSharedRoster } from '../lib/access'
import { cleanDisplayName } from '../lib/displayName'
import { useClanTracker, type MemberEvent, type TrackedGame } from '../lib/clanTracker'
import { RoleName, useWinsIndex } from './RoleName'
import { SectionHeading } from './ui'

const GAMES_SHOWN = 12
const EVENTS_SHOWN = 15

/** A clan member's name: linked to the profile (in the colours of the wins role) when they are registered on the site. */
function Who({ id, name, registered }: { id: string; name: string | null; registered: boolean }) {
  const wins = useWinsIndex()
  const label = cleanDisplayName(name ?? id)
  if (!registered) return <span className="text-slate-300">{label}</span>
  return (
    <Link to={`/member/${id}`} className="hover:text-accent-light">
      <RoleName wins={wins.byId.get(id)}>{label}</RoleName>
    </Link>
  )
}

const fmtDuration = (s: number | null) => (s == null ? '' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`)

/** The Clan page's blocks fed by the CYN bot: the latest games of the clan and who joined, left or got another role. */
export default function ClanTracker() {
  const { language } = useLanguage()
  const de = language === 'de'
  const { members, games, loaded } = useClanTracker()
  const roster = useSharedRoster()
  const registered = useMemo(() => new Set((roster?.members ?? []).map((m) => m.publicId)), [roster])
  const [allGames, setAllGames] = useState(false)
  if (!loaded || (!members && !games)) return null

  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(de ? 'de-DE' : 'en-GB', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : '–')
  const list = games?.games ?? []
  const shown = allGames ? list.slice(0, 50) : list.slice(0, GAMES_SHOWN)
  const role = { leader: de ? 'Leader' : 'Leader', officer: de ? 'Officer' : 'Officer', member: de ? 'Mitglied' : 'Member' }
  const eventText = (e: MemberEvent) => {
    if (e.type === 'joined') return de ? 'ist beigetreten' : 'joined'
    if (e.type === 'left') return de ? 'hat den Clan verlassen' : 'left the clan'
    return de ? `ist jetzt ${role[e.role]} (vorher ${role[e.from ?? 'member']})` : `is now ${role[e.role]} (was ${role[e.from ?? 'member']})`
  }

  return (
    <>
      {games && list.length > 0 && (
        <section className="space-y-4">
          <SectionHeading center eyebrow="Clan" title={de ? 'Clan-Spiele' : 'Clan games'} />
          <div className="panel divide-y divide-base-700/60">
            {shown.map((g: TrackedGame) => (
              <div key={g.gameId} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                <span className={`w-16 shrink-0 text-xs font-bold uppercase tracking-wide ${g.result === 'victory' ? 'text-signal-green' : 'text-signal-red'}`}>{g.result === 'victory' ? (de ? 'Sieg' : 'Victory') : de ? 'Niederlage' : 'Defeat'}</span>
                <span className="w-28 shrink-0 text-xs text-slate-500">{when(g.start)}</span>
                <span className="min-w-0 flex-1 text-slate-200">
                  <span className="font-medium text-white">{g.map ?? '?'}</span>
                  <span className="ml-2 text-xs text-slate-500">
                    {g.rankedType ? `${de ? 'Ranked' : 'Ranked'} ${g.rankedType}` : g.totalPlayers ? (de ? `${g.totalPlayers} Spieler` : `${g.totalPlayers} players`) : ''}
                    {g.durationSeconds != null ? ` · ${fmtDuration(g.durationSeconds)}` : ''}
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-400">
                    {g.clanPlayers.map((p, i) => (
                      <span key={p.publicId}>
                        {i > 0 && ', '}
                        <Who id={p.publicId} name={p.username} registered={registered.has(p.publicId)} />
                      </span>
                    ))}
                  </span>
                </span>
                <Link to={`/history?game=${encodeURIComponent(g.gameId)}`} className="shrink-0 text-xs font-semibold text-accent-light hover:text-accent">
                  {de ? 'Bericht' : 'Report'}
                </Link>
              </div>
            ))}
          </div>
          {list.length > GAMES_SHOWN && (
            <div className="flex justify-center">
              <button type="button" onClick={() => setAllGames((v) => !v)} className="btn-ghost text-sm">
                {allGames ? (de ? 'Weniger anzeigen' : 'Show less') : de ? `Mehr anzeigen (${Math.min(50, list.length)})` : `Show more (${Math.min(50, list.length)})`}
              </button>
            </div>
          )}
        </section>
      )}

      {members && (
        <section className="space-y-4">
          <SectionHeading center eyebrow="Clan" title={de ? 'Mitglieder' : 'Members'} />
          <div className="panel px-4 py-3 text-sm">
            <p className="text-slate-300">
              {de ? `${members.total} Mitglieder bei OpenFront` : `${members.total} members on OpenFront`}
              {members.pendingRequests ? <span className="ml-2 text-gold-light">{de ? `· ${members.pendingRequests} offene Beitrittsanfrage(n)` : `· ${members.pendingRequests} open join request(s)`}</span> : null}
              <span className="ml-2 text-xs text-slate-500">{de ? 'Stand' : 'as of'} {when(members.updated_at)}</span>
            </p>
            {members.events.length === 0 ? (
              <p className="mt-2 text-xs text-slate-500">{de ? 'Seit dem Start der Aufzeichnung ist niemand beigetreten, gegangen oder befördert worden.' : 'Since the recording started nobody joined, left or was promoted.'}</p>
            ) : (
              <ul className="mt-3 divide-y divide-base-700/60">
                {members.events.slice(0, EVENTS_SHOWN).map((e, i) => (
                  <li key={`${e.at}-${e.playerId}-${i}`} className="flex flex-wrap items-center gap-x-2 py-1.5">
                    <span className="w-28 shrink-0 text-xs text-slate-500">{when(e.at)}</span>
                    <Who id={e.playerId} name={e.username} registered={registered.has(e.playerId)} />
                    <span className={e.type === 'left' ? 'text-signal-red' : e.type === 'joined' ? 'text-signal-green' : 'text-gold-light'}>{eventText(e)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}
    </>
  )
}
