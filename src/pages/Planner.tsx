import { useMemo, useState } from 'react'
import { Card, SectionHeading } from '../components/ui'
import { StatsShell } from '../components/StatsShell'
import { clanSessionScore } from '../lib/clanScore'
import { useLanguage } from '../i18n/LanguageContext'
import { CLAN_TAG } from '../config'

const PRESETS: { teams: number; per: number }[] = [
  { teams: 2, per: 50 },
  { teams: 3, per: 22 },
  { teams: 4, per: 22 },
  { teams: 5, per: 7 },
  { teams: 5, per: 5 },
  { teams: 33, per: 3 },
]
const MATRIX_TEAMS = [2, 3, 4, 5, 6, 7, 8, 10, 15, 20, 33]
const MATRIX_CLAN = [1, 2, 3, 4, 5, 6]

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

  const matrix = useMemo(
    () =>
      MATRIX_TEAMS.map((n) => ({
        teams: n,
        cells: MATRIX_CLAN.map((c) => (c <= per ? { win: score(n, c, per, true), loss: score(n, c, per, false) } : null)),
      })),
    [per],
  )

  return (
    <StatsShell>
      <section className="space-y-6">
        <SectionHeading center eyebrow={t.planner.eyebrow} title={t.planner.title} />
        <p className="mx-auto max-w-2xl text-center text-sm text-slate-400">{t.planner.intro(CLAN_TAG)}</p>

        <Card className="mx-auto max-w-3xl space-y-5">
          <div className="flex flex-wrap justify-center gap-2" aria-label={t.planner.presets}>
            {PRESETS.map((p) => (
              <button
                key={`${p.teams}x${p.per}`}
                type="button"
                onClick={() => {
                  setTeams(p.teams)
                  setPer(p.per)
                }}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  teams === p.teams && per === p.per ? 'bg-accent text-white' : 'bg-base-800 text-slate-400 hover:bg-base-700 hover:text-slate-200'
                }`}
              >
                {t.planner.preset(p.teams, p.per)}
              </button>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Slider id="pl-teams" label={t.planner.teams} value={teams} min={2} max={40} onChange={setTeams} />
            <Slider id="pl-per" label={t.planner.perTeam} value={per} min={1} max={50} onChange={setPer} />
            <Slider id="pl-clan" label={t.planner.clanMembers(CLAN_TAG)} value={members} min={1} max={Math.min(8, per)} onChange={setClan} />
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

        <div className="mx-auto max-w-3xl">
          <h3 className="mb-2 text-center font-display text-lg font-bold text-white">{t.planner.matrixTitle(per)}</h3>
          <div className="panel overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm tabular-nums">
              <thead>
                <tr className="border-b border-base-700 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-3 py-2 text-left font-semibold">{t.planner.teams}</th>
                  {MATRIX_CLAN.map((c) => (
                    <th key={c} className={`px-3 py-2 text-right font-semibold ${c === members ? 'text-gold-light' : ''}`}>
                      {c} {CLAN_TAG}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.map((row) => (
                  <tr key={row.teams} className={`border-b border-base-700/50 last:border-0 ${row.teams === teams ? 'bg-gold/10' : ''}`}>
                    <td className="px-3 py-2 text-slate-200">{row.teams}</td>
                    {row.cells.map((cell, i) => (
                      <td key={i} className="px-3 py-2 text-right">
                        {cell ? (
                          <>
                            <span className="text-signal-green">+{dec(cell.win)}</span> <span className="text-slate-600">/</span>{' '}
                            <span className="text-signal-red">&minus;{dec(cell.loss)}</span>
                          </>
                        ) : (
                          <span className="text-slate-700">-</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-center text-xs text-slate-500">{t.planner.formulaNote}</p>
        </div>

        <Card className="mx-auto max-w-3xl space-y-3">
          <h3 className="font-display text-lg font-bold text-white">{t.planner.userscriptTitle}</h3>
          <p className="text-sm text-slate-400">{t.planner.userscriptText}</p>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-300">
            <li>{t.planner.userscriptStep1}</li>
            <li>{t.planner.userscriptStep2}</li>
            <li>{t.planner.userscriptStep3}</li>
          </ol>
          <a href="/cynosure-lobby-points.user.js" className="btn-accent inline-block">
            {t.planner.userscriptButton}
          </a>
        </Card>
      </section>
    </StatsShell>
  )
}
