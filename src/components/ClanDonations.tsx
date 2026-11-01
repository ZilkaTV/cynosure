import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLanguage } from '../i18n/LanguageContext'
import { useSharedRoster } from '../lib/access'
import { RoleName, useWinsIndex } from './RoleName'
import { cleanDisplayName } from '../lib/displayName'
import { useClanDonors, fetchClanTreasury, type ClanTreasury, type Currency, type Donor, type Period } from '../lib/clanDonors'
import { RankMedal } from './Emoji'
import { CurrencyIcon } from './CurrencyIcon'
import { Card, SectionHeading } from './ui'
import RecentDonations from './RecentDonations'

const fmt = (n: number | bigint, de: boolean) => n.toLocaleString(de ? 'de-DE' : 'en-US')
const TOP_ROWS = 10

/** Caps and plutonium in the clan's treasury, two small cards. */
export function ClanTreasuryCards() {
  const { language } = useLanguage()
  const de = language === 'de'
  const [t, setT] = useState<ClanTreasury | null | undefined>(undefined)
  useEffect(() => {
    let alive = true
    void fetchClanTreasury().then((v) => alive && setT(v))
    return () => {
      alive = false
    }
  }, [])
  if (t === null) return null
  const cards: { cur: Currency; label: string; value: number | null }[] = [
    { cur: 'soft', label: 'Caps', value: t?.caps ?? null },
    { cur: 'hard', label: 'Plutonium', value: t?.plutonium ?? null },
  ]
  return (
    <div className="grid grid-cols-2 gap-3">
      {cards.map((c) => (
        <div key={c.cur} className="flex items-center gap-3 rounded-xl border border-base-600 bg-base-850/60 px-4 py-3">
          <CurrencyIcon currency={c.cur} className="h-7 w-7" />
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">{de ? `Clan-Kasse · ${c.label}` : `Clan treasury · ${c.label}`}</p>
            <p className="font-display text-xl font-bold text-white tabular-nums">{c.value == null ? '…' : fmt(c.value, de)}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { key: T; label: string; currency?: Currency }[]; onChange: (k: T) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-base-600 bg-base-850/60 p-0.5">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors sm:text-sm ${value === o.key ? 'bg-accent text-white' : 'text-slate-400 hover:text-white'}`}
        >
          {o.currency && <CurrencyIcon currency={o.currency} className="h-4 w-4" />}
          {o.label}
        </button>
      ))}
    </div>
  )
}

function DonorRow({ d, rank, top, name, linked, de }: { d: Donor; rank: number; top: bigint; name: string; linked: boolean; de: boolean }) {
  const total = BigInt(d.total)
  const pct = top > 0n ? Math.max(2, Number((total * 100n) / top)) : 0
  const label = cleanDisplayName(name)
  const winsOf = useWinsIndex().byId.get(d.playerId)
  return (
    <div className="rounded-xl border border-base-700 bg-base-850/50 px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-base-800 text-sm font-bold text-slate-400">
          <RankMedal rank={rank} className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            {linked ? (
              <Link to={`/member/${d.playerId}`} className="min-w-0 break-words font-semibold text-white hover:text-accent-light">
                <RoleName wins={winsOf}>{label}</RoleName>
              </Link>
            ) : (
              <span className="truncate font-semibold text-slate-200">{label}</span>
            )}
            <span className="shrink-0 font-display text-base font-bold text-gold-light tabular-nums">{fmt(total, de)}</span>
          </div>
          <div className="mt-1.5 flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-base-700">
              <div className="h-full rounded-full bg-gradient-to-r from-accent to-gold" style={{ width: `${pct}%` }} />
            </div>
            <span className="shrink-0 text-[11px] text-slate-500">{de ? (d.donations === 1 ? '1 Spende' : `${d.donations} Spenden`) : d.donations === 1 ? '1 donation' : `${d.donations} donations`}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

/** The Clan page's block: the treasury and the ranking of the donors (caps / plutonium, all time / 30 days / 7 days). */
export default function ClanDonations() {
  const { language } = useLanguage()
  const de = language === 'de'
  const roster = useSharedRoster()
  const doc = useClanDonors()
  const [currency, setCurrency] = useState<Currency>('soft')
  const [period, setPeriod] = useState<Period>('all')
  const [showAll, setShowAll] = useState(false)
  const [view, setView] = useState<'top' | 'recent'>('top')

  // coming from the start page (/clan#spenden): scroll to this block once the page has been drawn
  useEffect(() => {
    if (window.location.hash !== '#spenden') return
    const timer = window.setTimeout(() => document.getElementById('spenden')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 700)
    return () => window.clearTimeout(timer)
  }, [])

  // registered members are shown with the name of the site, everybody else with the name OpenFront gives
  const names = useMemo(() => new Map((roster?.members ?? []).map((m) => [m.publicId, m.name] as const)), [roster])
  const rows = doc?.boards?.[currency]?.[period] ?? []
  const top = rows.length ? BigInt(rows[0].total) : 0n
  const shown = showAll ? rows : rows.slice(0, TOP_ROWS)
  const updated = doc?.updated_at ? new Date(doc.updated_at).toLocaleDateString(de ? 'de-DE' : 'en-GB', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : null

  return (
    <section id="spenden" className="scroll-mt-4 space-y-4">
      <SectionHeading center eyebrow={de ? 'Clan' : 'Clan'} title={de ? 'Spenden' : 'Donations'} />
      <ClanTreasuryCards />
      <Card className="space-y-4">
        <div className="flex justify-center">
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { key: 'top', label: de ? 'Top-Spender' : 'Top donors' },
              { key: 'recent', label: de ? 'Neueste' : 'Recent' },
            ]}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Segmented
            value={currency}
            onChange={(c) => {
              setCurrency(c)
              setShowAll(false)
            }}
            options={[
              { key: 'soft', label: 'Caps', currency: 'soft' },
              { key: 'hard', label: 'Plutonium', currency: 'hard' },
            ]}
          />
          {view === 'top' && (
            <Segmented
              value={period}
              onChange={(p) => {
                setPeriod(p)
                setShowAll(false)
              }}
              options={[
                { key: 'all', label: de ? 'Gesamt' : 'All time' },
                { key: 'month', label: de ? '30 Tage' : '30 days' },
                { key: 'week', label: de ? '7 Tage' : '7 days' },
              ]}
            />
          )}
        </div>
        {view === 'recent' && doc?.boards ? (
          <RecentDonations currency={currency} limit={20} />
        ) : doc === undefined ? (
          <p className="py-6 text-center text-sm text-slate-500">…</p>
        ) : !doc?.boards ? (
          <p className="py-6 text-center text-sm text-slate-500">
            {doc === null
              ? de
                ? 'Die Spender sind nur für angemeldete Mitglieder sichtbar.'
                : 'The donors are only visible to signed-in members.'
              : de
                ? 'Noch keine Spender-Daten. Der CYN-Bot trägt sie ein, sobald er eingerichtet ist.'
                : 'No donor data yet. The CYN bot adds them as soon as it is set up.'}
          </p>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">{de ? 'In diesem Zeitraum gab es keine Spenden.' : 'No donations in this period.'}</p>
        ) : (
          <div className="space-y-2">
            {shown.map((d, i) => (
              <DonorRow key={d.playerId} d={d} rank={i + 1} top={top} name={names.get(d.playerId) ?? d.username ?? d.playerId} linked={names.has(d.playerId)} de={de} />
            ))}
            {rows.length > TOP_ROWS && (
              <div className="flex justify-center pt-1">
                <button type="button" onClick={() => setShowAll((v) => !v)} className="btn-ghost text-sm">
                  {showAll ? (de ? `Nur Top ${TOP_ROWS}` : `Top ${TOP_ROWS} only`) : de ? `Alle ${rows.length} anzeigen` : `Show all ${rows.length}`}
                </button>
              </div>
            )}
          </div>
        )}
        {updated && <p className="text-center text-xs text-slate-500">{de ? `Stand: ${updated}` : `Updated: ${updated}`}</p>}
      </Card>
    </section>
  )
}
