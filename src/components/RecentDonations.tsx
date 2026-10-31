import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useLanguage } from '../i18n/LanguageContext'
import { useSharedRoster } from '../lib/access'
import { cleanDisplayName } from '../lib/displayName'
import { useClanDonors, type Currency } from '../lib/clanDonors'
import { CurrencyIcon } from './CurrencyIcon'
import { RoleName, useWinsIndex } from './RoleName'

/** The newest single donations (like the Recent tab of OpenFront's clan page), caps and / or plutonium. */
export default function RecentDonations({ currency, limit, compact = false }: { currency: Currency | 'all'; limit: number; compact?: boolean }) {
  const { language } = useLanguage()
  const de = language === 'de'
  const doc = useClanDonors()
  const roster = useSharedRoster()
  const wins = useWinsIndex()
  const names = useMemo(() => new Map((roster?.members ?? []).map((m) => [m.publicId, m.name] as const)), [roster])
  // donations carry no name: take it from the rankings when the donor is not registered here
  const boardNames = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of ['soft', 'hard'] as const) for (const p of ['all', 'month', 'week'] as const) for (const d of doc?.boards?.[c]?.[p] ?? []) if (d.username && !m.has(d.playerId)) m.set(d.playerId, d.username)
    return m
  }, [doc])

  const list = (doc?.recent ?? []).filter((r) => currency === 'all' || r.currency === currency).slice(0, limit)
  if (list.length === 0) return <p className={compact ? 'px-4 py-4 text-sm text-slate-500' : 'py-6 text-center text-sm text-slate-500'}>{de ? 'Noch keine einzelnen Spenden gespeichert.' : 'No single donations stored yet.'}</p>
  const when = (iso: string) => new Date(iso).toLocaleString(de ? 'de-DE' : 'en-GB', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <ul className={compact ? 'divide-y divide-base-700/60' : 'divide-y divide-base-700/60 rounded-xl border border-base-700 bg-base-850/50'}>
      {list.map((r, i) => {
        const registered = names.has(r.playerId)
        const label = cleanDisplayName(names.get(r.playerId) ?? boardNames.get(r.playerId) ?? r.playerId)
        return (
          <li key={`${r.at}-${r.playerId}-${i}`} className={compact ? 'px-4 py-2' : 'px-4 py-2.5'}>
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 break-words text-sm font-medium text-slate-200">
                {registered ? (
                  <Link to={`/member/${r.playerId}`} className="hover:text-accent-light">
                    <RoleName wins={wins.byId.get(r.playerId)}>{label}</RoleName>
                  </Link>
                ) : (
                  label
                )}
              </span>
              <span className="inline-flex shrink-0 items-center gap-1 font-display text-sm font-bold text-gold-light tabular-nums">
                <CurrencyIcon currency={r.currency} className="h-3.5 w-3.5" />
                {BigInt(r.amount).toLocaleString(de ? 'de-DE' : 'en-US')}
              </span>
            </div>
            <p className="text-[11px] text-slate-500">{when(r.at)}</p>
          </li>
        )
      })}
    </ul>
  )
}
