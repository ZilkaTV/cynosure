import { useEffect, useState } from 'react'
import { Card, SectionHeading } from '../components/ui'
import { StatsShell } from '../components/StatsShell'
import DecayForecast from '../components/DecayForecast'
import { clanSessionScore } from '../lib/clanScore'
import { useLanguage } from '../i18n/LanguageContext'
import { CLAN_TAG } from '../config'

// The lobby can hold at most this many players (OpenFront's biggest public lobbies).
const MAX_PLAYERS = 120
const MAX_POINT_CLAN = [2, 3, 4, 5, 6, 7, 8]

const ADDON_URL = '/cynosure-lobby-points.user.js'

function newerVersion(latest: string, installed: string) {
  const a = latest.split('.').map(Number)
  const b = installed.split('.').map(Number)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0)
  }
  return false
}

/** Version of the installed lobby add-on (it reports itself on this page) and the latest published one. */
function useAddonVersions() {
  const [installed, setInstalled] = useState<string | null>(() => document.documentElement.getAttribute('data-cyn-lobby-addon'))
  const [latest, setLatest] = useState<string | null>(null)
  useEffect(() => {
    const read = () => setInstalled(document.documentElement.getAttribute('data-cyn-lobby-addon'))
    window.addEventListener('cyn-lobby-addon', read)
    // The add-on runs after the page has loaded, so watch the attribute too.
    const obs = new MutationObserver(read)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-cyn-lobby-addon'] })
    let alive = true
    fetch(ADDON_URL, { cache: 'no-store' })
      .then((r) => r.text())
      .then((txt) => {
        const m = /@version\s+([\d.]+)/.exec(txt)
        if (alive && m) setLatest(m[1])
      })
      .catch(() => {})
    return () => {
      alive = false
      window.removeEventListener('cyn-lobby-addon', read)
      obs.disconnect()
    }
  }, [])
  return { installed, latest, outdated: !!(installed && latest && newerVersion(latest, installed)) }
}

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
  const addon = useAddonVersions()
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

        <Card className="mx-auto max-w-3xl space-y-3">
          <h3 className="font-display text-lg font-bold text-white">{t.planner.userscriptTitle}</h3>
          <p className="text-sm text-slate-400">{t.planner.userscriptText}</p>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-300">
            <li>{t.planner.userscriptStep1}</li>
            <li>{t.planner.userscriptStep2}</li>
            <li>{t.planner.userscriptStep3}</li>
          </ol>
          <div className="flex flex-wrap items-center gap-3">
            <a href={ADDON_URL} className="btn-accent inline-block">
              {t.planner.userscriptButton}
            </a>
            {addon.outdated || !addon.installed ? (
              <a
                href={ADDON_URL}
                className="btn-ghost relative inline-block"
                title={addon.outdated ? t.planner.userscriptUpdateNew(addon.latest ?? '') : t.planner.userscriptNotDetected}
              >
                {t.planner.userscriptUpdate}
                {addon.outdated && <span className="absolute -right-1 -top-1 h-3 w-3 animate-pulse rounded-full bg-red-500 ring-2 ring-base-900" aria-hidden />}
              </a>
            ) : (
              <button
                type="button"
                disabled
                className="btn-ghost inline-block cursor-not-allowed opacity-40"
                title={t.planner.userscriptUpToDate(addon.installed ?? '')}
              >
                {t.planner.userscriptUpdate}
              </button>
            )}
            {addon.installed && !addon.outdated && <span className="text-xs text-slate-500">{t.planner.userscriptUpToDate(addon.installed)}</span>}
          </div>
        </Card>

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
