import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLanguage } from '../i18n/LanguageContext'
import { useSharedRoster } from '../lib/access'
import { useIsAdmin } from '../lib/useSession'
import { cleanDisplayName } from '../lib/displayName'
import {
  reloadClanDonors,
  useClanDonors,
  fetchClanTreasury,
  parseDonorExport,
  saveClanDonors,
  type ClanTreasury,
  type Currency,
  type Donor,
  type DonorBoards,
  type Period,
} from '../lib/clanDonors'
import { RankMedal } from './Emoji'
import { CurrencyIcon } from './CurrencyIcon'
import { Card, SectionHeading } from './ui'

const fmt = (n: number | bigint, de: boolean) => n.toLocaleString(de ? 'de-DE' : 'en-US')
const TOP_ROWS = 10
/** The page that sends the data (the userscript runs there). */
const OPENFRONT_ORIGIN = 'https://openfront.io'

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

/** The page of an admin who imports: gets the ranking from the userscript on openfront.io (or pasted), shows it, saves it. */
function ImportPanel({ onSaved }: { onSaved: () => void }) {
  const { language } = useLanguage()
  const de = language === 'de'
  const [pending, setPending] = useState<DonorBoards | null>(null)
  const [paste, setPaste] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const autoOpen = new URLSearchParams(window.location.search).get('import') === 'donors'

  // The userscript opens this page and answers when this page says it is ready (checked origin both ways).
  useEffect(() => {
    if (!window.opener) return
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== OPENFRONT_ORIGIN || e.data?.type !== 'cyn-donors') return
      const boards = parseDonorExport(e.data)
      if (boards) {
        setPending(boards)
        setMessage(null)
      } else setMessage(de ? 'Die Daten von OpenFront sehen nicht richtig aus.' : 'The data from OpenFront does not look right.')
    }
    window.addEventListener('message', onMessage)
    const ping = window.setInterval(() => window.opener?.postMessage({ type: 'cyn-donors-ready' }, OPENFRONT_ORIGIN), 700)
    const stop = window.setTimeout(() => window.clearInterval(ping), 60_000)
    return () => {
      window.removeEventListener('message', onMessage)
      window.clearInterval(ping)
      window.clearTimeout(stop)
    }
  }, [de])

  function onPaste(text: string) {
    setPaste(text)
    if (!text.trim()) return
    const boards = parseDonorExport(text)
    setPending(boards)
    setMessage(boards ? null : de ? 'Das ist nicht der Text des Userscripts.' : 'This is not the text from the userscript.')
  }

  async function save() {
    if (!pending) return
    setSaving(true)
    const r = await saveClanDonors(pending)
    setSaving(false)
    setMessage(r.ok ? (de ? 'Gespeichert.' : 'Saved.') : r.message)
    if (r.ok) {
      setPending(null)
      setPaste('')
      onSaved()
    }
  }

  const count = pending ? pending.soft.all.length + pending.hard.all.length : 0
  return (
    <details open={autoOpen} className="rounded-xl border border-gold/30 bg-gold/5 px-4 py-3 text-sm text-slate-300">
      <summary className="cursor-pointer font-semibold text-gold-light">{de ? 'Admin: Spender aktualisieren' : 'Admin: update the donors'}</summary>
      <ol className="mt-3 list-inside list-decimal space-y-1 text-slate-400">
        <li>
          {de ? 'Userscript einmal installieren (Tampermonkey):' : 'Install the userscript once (Tampermonkey):'}{' '}
          <a href="/cynosure-donors.user.js" className="text-accent-light underline hover:text-accent">
            cynosure-donors.user.js
          </a>
        </li>
        <li>{de ? 'Auf openfront.io die Clan-Seite öffnen (Tab Donations), du musst im Clan sein und angemeldet.' : 'Open the clan page on openfront.io (Donations tab); you have to be in the clan and signed in.'}</li>
        <li>{de ? 'Unten links auf „An CynClan senden“ klicken: die Daten landen hier, du speicherst sie.' : 'Click “Send to CynClan” at the bottom left: the data arrives here and you save it.'}</li>
      </ol>
      <p className="mt-2 text-xs text-slate-500">
        {de ? 'Dein OpenFront-Login bleibt in deinem Browser, die Seite bekommt nur die Rangliste.' : 'Your OpenFront login stays in your browser, the site only receives the ranking.'}
      </p>
      <textarea
        value={paste}
        onChange={(e) => onPaste(e.target.value)}
        rows={2}
        placeholder={de ? 'Alternativ: Text des Userscripts hier einfügen' : 'Or paste the text of the userscript here'}
        className="mt-3 w-full rounded-lg border border-base-600 bg-base-800 px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-accent focus:outline-none"
      />
      {pending && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="text-slate-200">
            {de ? `Bereit: ${count} Spender-Einträge (Gesamt, Caps und Plutonium).` : `Ready: ${count} donor entries (all time, caps and plutonium).`}
          </span>
          <button type="button" onClick={save} disabled={saving} className="btn-accent !px-5 !py-1.5 text-sm disabled:opacity-50">
            {saving ? '…' : de ? 'Speichern' : 'Save'}
          </button>
        </div>
      )}
      {message && <p className="mt-2 text-xs text-slate-400">{message}</p>}
    </details>
  )
}

function DonorRow({ d, rank, top, name, linked, de }: { d: Donor; rank: number; top: bigint; name: string; linked: boolean; de: boolean }) {
  const total = BigInt(d.total)
  const pct = top > 0n ? Math.max(2, Number((total * 100n) / top)) : 0
  const label = cleanDisplayName(name)
  return (
    <div className="rounded-xl border border-base-700 bg-base-850/50 px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-base-800 text-sm font-bold text-slate-400">
          <RankMedal rank={rank} className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            {linked ? (
              <Link to={`/member/${d.playerId}`} className="truncate font-semibold text-white hover:text-accent-light">
                {label}
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
  const isAdmin = useIsAdmin()
  const roster = useSharedRoster()
  const doc = useClanDonors()
  const [currency, setCurrency] = useState<Currency>('soft')
  const [period, setPeriod] = useState<Period>('all')
  const [showAll, setShowAll] = useState(false)

  const reload = () => void reloadClanDonors()
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
        </div>
        {doc === undefined ? (
          <p className="py-6 text-center text-sm text-slate-500">…</p>
        ) : !doc?.boards ? (
          <p className="py-6 text-center text-sm text-slate-500">
            {doc === null
              ? de
                ? 'Die Spender sind nur für angemeldete Mitglieder sichtbar.'
                : 'The donors are only visible to signed-in members.'
              : de
                ? 'Noch keine Spender-Daten. Ein Admin kann sie mit dem Userscript eintragen.'
                : 'No donor data yet. An admin can add it with the userscript.'}
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
      {isAdmin && <ImportPanel onSaved={reload} />}
    </section>
  )
}
