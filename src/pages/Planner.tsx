import { useState } from 'react'
import { Card, SectionHeading } from '../components/ui'
import { StatsShell } from '../components/StatsShell'
import DecayForecast from '../components/DecayForecast'
import { clanSessionScore } from '../lib/clanScore'
import { useLanguage } from '../i18n/LanguageContext'
import { CLAN_TAG } from '../config'

// The lobby can hold at most this many players (OpenFront's biggest public lobbies).
const MAX_PLAYERS = 120
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

function Slider({ id, label, value, min, max, onChange }: { id: string; label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  return (
    <label htmlFor={id} className="block space-y-1 text-sm text-slate-400">
      <span className="flex justify-between">
        <span>{label}</span>
        <b className="tabular-nums text-white">{value}</b>
      </span>
      <input id={id} type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[#d8b96a]" />
    </label>
  )
}

const score = (numTeams: number, clanPlayers: number, perTeam: number, won: boolean) =>
  clanSessionScore({ totalPlayerCount: numTeams * perTeam, numTeams, clanPlayerCount: Math.min(clanPlayers, perTeam), won })

/**
 * Win/loss clan points for a lobby layout - OpenFront's own clan-score formula (see src/lib/clanScore.ts),
 * so a member can pick a lobby by the points it is worth before joining.
 */
export default function Planner() {
  const { t } = useLanguage()
  const [teams, setTeams] = useState(5)
  const [per, setPer] = useState(7)
  const [clan, setClan] = useState(2)
  const members = Math.min(clan, per)

  const win = score(teams, members, per, true)
  const loss = score(teams, members, per, false)
  const breakEven = (100 * loss) / (win + loss)

  return (
    <StatsShell>
      <section className="space-y-6">
        <SectionHeading center eyebrow={t.planner.eyebrow} title={t.planner.title} />
        <p className="mx-auto max-w-2xl text-center text-sm text-slate-400">{t.planner.intro(CLAN_TAG)}</p>

        <Card className="mx-auto max-w-3xl space-y-5">
          <div className="flex flex-wrap justify-center gap-2" aria-label={t.planner.presets}>
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
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    active ? 'bg-accent text-white' : 'bg-base-800 text-slate-400 hover:bg-base-700 hover:text-slate-200'
                  }`}
                >
                  {t.planner.maxPoints(c, CLAN_TAG)}
                </button>
              )
            })}
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Slider id="pl-teams" label={t.planner.teams} value={teams} min={2} max={60} onChange={setTeams} />
            <Slider id="pl-per" label={t.planner.perTeam} value={per} min={1} max={50} onChange={setPer} />
            <Slider id="pl-clan" label={t.planner.clanMembers(CLAN_TAG)} value={members} min={1} max={Math.min(50, per)} onChange={setClan} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-base-700 bg-base-850/60 p-4 text-center">
              <p className="text-xs uppercase tracking-wide text-slate-400">{t.planner.win}</p>
              <p className="mt-1 font-display text-3xl font-bold tabular-nums text-signal-green">+{dec(win)}</p>
            </div>
            <div className="rounded-xl border border-base-700 bg-base-850/60 p-4 text-center">
              <p className="text-xs uppercase tracking-wide text-slate-400">{t.planner.loss}</p>
              <p className="mt-1 font-display text-3xl font-bold tabular-nums text-signal-red">&minus;{dec(loss)}</p>
            </div>
            <div className="rounded-xl border border-base-700 bg-base-850/60 p-4 text-center">
              <p className="text-xs uppercase tracking-wide text-slate-400">{t.planner.breakEven}</p>
              <p className="mt-1 font-display text-3xl font-bold tabular-nums text-gold-light">{Math.round(breakEven)}%</p>
            </div>
          </div>
          <p className="text-center text-sm text-slate-400">{t.planner.summary(teams * per, teams, win / loss)}</p>
        </Card>

        <p className="mx-auto max-w-3xl text-center text-xs text-slate-500">{t.planner.formulaNote}</p>

        <DecayForecast />
      </section>
    </StatsShell>
  )
}
