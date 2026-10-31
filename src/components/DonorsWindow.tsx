import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLanguage } from '../i18n/LanguageContext'
import { useProfile } from '../lib/useProfile'
import { useSharedRoster } from '../lib/access'
import { cleanDisplayName } from '../lib/displayName'
import { useClanDonors, type Currency, type Period } from '../lib/clanDonors'
import { RankMedal } from './Emoji'
import { RoleName, useWinsIndex } from './RoleName'
import { CurrencyIcon } from './CurrencyIcon'
import RecentDonations from './RecentDonations'

const TOP = 5
const CURRENCIES: { key: Currency; label: string }[] = [
  { key: 'soft', label: 'Caps' },
  { key: 'hard', label: 'Plutonium' },
]

/** The sidebar window under the clan window: the top donors (caps / plutonium, all time / 30 days / 7 days). The full list is on the Clan page. */
export function DonorsWindow() {
  const { profile } = useProfile()
  const { language } = useLanguage()
  const de = language === 'de'
  const doc = useClanDonors()
  const roster = useSharedRoster()
  const [currency, setCurrency] = useState<Currency>('soft')
  const [period, setPeriod] = useState<Period>('all')
  const [view, setView] = useState<'top' | 'recent'>('top')
  const names = useMemo(() => new Map((roster?.members ?? []).map((m) => [m.publicId, m.name] as const)), [roster])

  const wins = useWinsIndex()
  // only for signed-in members; nothing while loading or when the visitor may not see the list
  if (!profile || !doc) return null
  const periods: { key: Period; label: string }[] = [
    { key: 'all', label: de ? 'Gesamt' : 'All' },
    { key: 'month', label: de ? '30 T.' : '30 d' },
    { key: 'week', label: de ? '7 T.' : '7 d' },
  ]
  const rows = doc.boards?.[currency]?.[period] ?? []
  const top = rows.length ? BigInt(rows[0].total) : 0n
  const chip = (active: boolean) => `rounded-md px-2 py-1 text-[11px] font-semibold transition-colors ${active ? 'bg-accent text-white' : 'text-slate-400 hover:text-white'}`

  return (
    <div className="panel mt-4 overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-base-700 px-4 py-3">
        <span className="font-display text-sm font-bold uppercase tracking-wide text-gold">{de ? 'Spender' : 'Donors'}</span>
        <div className="inline-flex rounded-lg border border-base-600 bg-base-850/60 p-0.5">
          <button type="button" onClick={() => setView('top')} className={chip(view === 'top')}>
            Top
          </button>
          <button type="button" onClick={() => setView('recent')} className={chip(view === 'recent')}>
            {de ? 'Neueste' : 'Recent'}
          </button>
        </div>
      </div>
      {doc.boards && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-base-700 px-3 py-2">
          <div className="inline-flex rounded-lg border border-base-600 bg-base-850/60 p-0.5">
            {CURRENCIES.map((c) => (
              <button key={c.key} type="button" onClick={() => setCurrency(c.key)} aria-label={c.label} title={c.label} className={`inline-flex items-center ${chip(currency === c.key)}`}>
                <CurrencyIcon currency={c.key} className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>
          {view === 'top' && (
            <div className="inline-flex rounded-lg border border-base-600 bg-base-850/60 p-0.5">
              {periods.map((p) => (
                <button key={p.key} type="button" onClick={() => setPeriod(p.key)} className={chip(period === p.key)}>
                  {p.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {view === 'recent' && doc.boards ? (
        <RecentDonations currency={currency} limit={6} compact />
      ) : !doc.boards ? (
        <p className="px-4 py-4 text-sm text-slate-500">{de ? 'Noch keine Spender-Daten.' : 'No donor data yet.'}</p>
      ) : rows.length === 0 ? (
        <p className="px-4 py-4 text-sm text-slate-500">{de ? 'Keine Spenden in diesem Zeitraum.' : 'No donations in this period.'}</p>
      ) : (
        <ul className="divide-y divide-base-700/60">
          {rows.slice(0, TOP).map((d, i) => {
            const pct = top > 0n ? Math.max(3, Number((BigInt(d.total) * 100n) / top)) : 0
            return (
              <li key={d.playerId} className="px-4 py-2">
                <div className="flex items-center gap-2">
                  <span className="flex w-5 shrink-0 justify-center text-xs font-bold text-slate-500">
                    <RankMedal rank={i + 1} className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1 break-words text-sm font-medium text-slate-200">
                    {names.has(d.playerId) ? (
                      <Link to={`/member/${d.playerId}`} className="hover:text-accent-light">
                        <RoleName wins={wins.byId.get(d.playerId)}>{cleanDisplayName(names.get(d.playerId) ?? d.playerId)}</RoleName>
                      </Link>
                    ) : (
                      cleanDisplayName(d.username ?? d.playerId)
                    )}
                  </span>
                  <span className="shrink-0 font-display text-sm font-bold text-gold-light tabular-nums">{BigInt(d.total).toLocaleString(de ? 'de-DE' : 'en-US')}</span>
                </div>
                <div className="ml-7 mt-1 h-1 overflow-hidden rounded-full bg-base-700">
                  <div className="h-full rounded-full bg-gradient-to-r from-accent to-gold" style={{ width: `${pct}%` }} />
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <Link to="/clan#spenden" className="block border-t border-base-700 px-4 py-2 text-center text-xs font-semibold text-accent-light transition-colors hover:bg-base-800/60 hover:text-accent">
        {de ? 'Alle Spender →' : 'All donors →'}
      </Link>
    </div>
  )
}
