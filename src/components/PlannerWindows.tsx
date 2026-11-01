import { useEffect, useState } from 'react'
import { fetchTopClanLeaderboard, forecastWinScoreLoss, clanSessionScore, type TopClanEntry } from '../lib/clanScore'
import { CLAN_TAG } from '../config'
import { useLanguage } from '../i18n/LanguageContext'

// The lobby can hold at most this many players (OpenFront v0.35: the size comes from the map, up to 215).
const MAX_PLAYERS = 215
const MAX_POINT_CLAN = [2, 3, 4, 5, 6, 7, 8]

/**
 * The layout that gives the most points for a given number of clan players: a team made up of clan members only
 * (at least 2 per team, a team of one is no team game) and as many teams as the lobby holds - more teams raise the
 * difficulty factor of the formula.
 */
function maxPointsLayout(clan: number) {
  const per = Math.max(clan, 2)
  return { teams: Math.floor(MAX_PLAYERS / per), per, clan }
}

const dec = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const score = (numTeams: number, clanPlayers: number, perTeam: number, won: boolean) =>
  clanSessionScore({ totalPlayerCount: numTeams * perTeam, numTeams, clanPlayerCount: Math.min(clanPlayers, perTeam), won })

function Slider({ id, label, value, min, max, onChange }: { id: string; label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  return (
    <label htmlFor={id} className="block space-y-1 text-xs text-slate-400">
      <span className="flex justify-between">
        <span>{label}</span>
        <b className="tabular-nums text-white">{value}</b>
      </span>
      <input id={id} type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[#d8b96a]" />
    </label>
  )
}

function WindowHead({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="border-b border-base-700 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">{eyebrow}</p>
      <span className="font-display text-sm font-bold uppercase tracking-wide text-gold">{title}</span>
    </div>
  )
}

/**
 * Win/loss clan points for a lobby layout - OpenFront's own clan-score formula (see src/lib/clanScore.ts),
 * so a member can pick a lobby by the points it is worth before joining. A sidebar window of the Monthly Team page.
 */
export function PointsPlannerWindow() {
  const { t } = useLanguage()
  const [teams, setTeams] = useState(5)
  const [per, setPer] = useState(7)
  const [clan, setClan] = useState(2)
  const members = Math.min(clan, per)
  // Teams times players per team can never exceed what a lobby holds.
  const changeTeams = (n: number) => {
    setTeams(n)
    setPer((p) => Math.min(p, Math.floor(MAX_PLAYERS / n)))
  }
  const changePer = (n: number) => {
    setPer(n)
    setTeams((tm) => Math.min(tm, Math.floor(MAX_PLAYERS / n)))
  }

  const win = score(teams, members, per, true)
  const loss = score(teams, members, per, false)
  const breakEven = (100 * loss) / (win + loss)

  return (
    <div className="panel mt-6 overflow-hidden">
      <WindowHead eyebrow={t.planner.eyebrow} title={t.planner.title} />
      <div className="space-y-3 p-4">
        <div className="flex flex-wrap gap-1.5" aria-label={t.planner.presets}>
          {MAX_POINT_CLAN.map((c) => {
            const p = maxPointsLayout(c)
            const active = teams === p.teams && per === p.per && members === p.clan
            return (
              <button
                key={c}
                type="button"
                onClick={() => {
                  setTeams(p.teams)
                  setPer(p.per)
                  setClan(p.clan)
                }}
                title={t.planner.maxPoints(c, CLAN_TAG)}
                className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${active ? 'bg-accent text-white' : 'bg-base-800 text-slate-400 hover:bg-base-700 hover:text-slate-200'}`}
              >
                {c}
              </button>
            )
          })}
        </div>
        <Slider id="pl-teams" label={t.planner.teams} value={teams} min={2} max={Math.floor(MAX_PLAYERS / 2)} onChange={changeTeams} />
        <Slider id="pl-per" label={t.planner.perTeam} value={per} min={1} max={Math.floor(MAX_PLAYERS / 2)} onChange={changePer} />
        <Slider id="pl-clan" label={t.planner.clanMembers(CLAN_TAG)} value={members} min={1} max={per} onChange={setClan} />
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg border border-base-700 bg-base-850/60 px-1 py-2">
            <p className="text-[10px] uppercase tracking-wide text-slate-400">{t.planner.win}</p>
            <p className="font-display text-base font-bold tabular-nums text-signal-green">+{dec(win)}</p>
          </div>
          <div className="rounded-lg border border-base-700 bg-base-850/60 px-1 py-2">
            <p className="text-[10px] uppercase tracking-wide text-slate-400">{t.planner.loss}</p>
            <p className="font-display text-base font-bold tabular-nums text-signal-red">&minus;{dec(loss)}</p>
          </div>
          <div className="rounded-lg border border-base-700 bg-base-850/60 px-1 py-2">
            <p className="text-[10px] uppercase tracking-wide text-slate-400">{t.planner.breakEven}</p>
            <p className="font-display text-base font-bold tabular-nums text-gold-light">{Math.round(breakEven)}%</p>
          </div>
        </div>
        <p className="text-xs text-slate-400">{t.planner.summary(teams * per, teams, win / loss)}</p>
        <p className="text-[11px] text-slate-500">{t.planner.formulaNote}</p>
      </div>
    </div>
  )
}

/**
 * How much Win Score a clan loses to OpenFront's time decay if it plays no further team games (30-day half-life).
 * A sidebar window of the Monthly Team page.
 */
export function DecayForecastWindow() {
  const { t } = useLanguage()
  const [topClans, setTopClans] = useState<TopClanEntry[]>([])
  const [clanTag, setClanTag] = useState('')
  const [days, setDays] = useState(1)

  useEffect(() => {
    let alive = true
    fetchTopClanLeaderboard()
      .then((top) => {
        if (!alive) return
        setTopClans(top)
        // Our own clan by default, not whoever is #1; falls back to #1 only if CYN is not in the list.
        const defaultTag = top.some((c) => c.clanTag === CLAN_TAG) ? CLAN_TAG : top[0]?.clanTag
        if (defaultTag) setClanTag((prev) => prev || defaultTag)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  if (topClans.length === 0) return null
  const clan = topClans.find((c) => c.clanTag === clanTag)
  const loss = clan ? forecastWinScoreLoss(clan.weightedWins, days) : 0
  const select = 'min-w-0 flex-1 rounded-md border border-base-600 bg-base-800 px-2 py-1.5 text-xs text-white focus:border-accent focus:outline-none'

  return (
    <div className="panel mt-6 overflow-hidden">
      <WindowHead eyebrow={t.planner.decayEyebrow} title={t.planner.decayTitle} />
      <div className="space-y-3 p-4">
        <p className="text-xs text-slate-400">{t.planner.decayText}</p>
        <div className="flex gap-2">
          <select aria-label={t.planner.decayClan} value={clanTag} onChange={(e) => setClanTag(e.target.value)} className={select}>
            {topClans.map((c, i) => (
              <option key={c.clanTag} value={c.clanTag}>
                #{i + 1} [{c.clanTag}]
              </option>
            ))}
          </select>
          <select aria-label={t.planner.decayWindow} value={days} onChange={(e) => setDays(Number(e.target.value))} className={select}>
            <option value={1}>{t.planner.decayNextDay}</option>
            <option value={7}>{t.planner.decayNextWeek}</option>
            <option value={30}>{t.planner.decayNextMonth}</option>
          </select>
        </div>
        {clan && (
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-400">{t.planner.decayNow}</dt>
              <dd className="font-semibold tabular-nums text-white">{clan.weightedWins.toFixed(1)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">{t.planner.decayLost}</dt>
              <dd className="font-semibold tabular-nums text-gold-light">-{loss.toFixed(1)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">{t.planner.decayProjected}</dt>
              <dd className="font-semibold tabular-nums text-accent-light">{(clan.weightedWins - loss).toFixed(1)}</dd>
            </div>
          </dl>
        )}
      </div>
    </div>
  )
}
