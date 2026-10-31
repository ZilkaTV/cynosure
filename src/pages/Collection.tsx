import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import CardCanvas from '../components/CardCanvas'
import { RegistrationGate } from '../components/StatsShell'
import { SectionHeading, Spinner } from '../components/ui'
import { useLanguage } from '../i18n/LanguageContext'
import {
  RARITIES,
  RARITY_INFO,
  boostersReady,
  fetchCollection,
  grantBoosters,
  openBooster,
  refreshBoosterState,
  setBoosterState,
  useBoosterState,
  type CollectedCard,
  type PulledCard,
  type Rarity,
} from '../lib/boosters'
import { RARITY_LOOK } from '../lib/drawPlayerCard'
import type { PlayerCardData } from '../lib/playerCard'
import { EXTRAS_CHANGED, fetchAvatars, type Fit } from '../lib/profileExtras'
import { QUESTS_CHANGED } from '../lib/notifications'
import { useCardData } from '../lib/useCardData'
import { useProfile } from '../lib/useProfile'
import { useIsAdmin } from '../lib/useSession'

type Avatars = Record<string, { src: string; fit: Fit | null }>
const TILES_SHOWN = 24

const rarityName = (r: Rarity, de: boolean) => RARITY_INFO[r][de ? 'de' : 'en']

/** hh:mm:ss until the given ISO time */
function countdown(iso: string | null, now: number): string {
  if (!iso) return ''
  const s = Math.max(0, Math.floor((Date.parse(iso) - now) / 1000))
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`
}

/** The three cards of an opened booster, turned over one after the other. */
function PackReveal({ pulled, cards, avatars, de, onClose }: { pulled: PulledCard[]; cards: Map<string, PlayerCardData>; avatars: Avatars; de: boolean; onClose: () => void }) {
  const [shown, setShown] = useState(0)
  useEffect(() => {
    if (shown >= pulled.length) return
    const timer = window.setTimeout(() => setShown((n) => n + 1), shown === 0 ? 400 : 900)
    return () => window.clearTimeout(timer)
  }, [shown, pulled.length])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  const best = pulled.reduce((b, c) => (RARITIES.indexOf(c.rarity) > RARITIES.indexOf(b) ? c.rarity : b), 'common' as Rarity)
  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center overflow-y-auto bg-black/85 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={de ? 'Booster geöffnet' : 'Booster opened'}>
      <div className="w-full max-w-4xl py-6">
        <h2 className="mb-5 text-center font-display text-2xl font-bold text-white">{de ? 'Dein Booster' : 'Your booster'}</h2>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          {pulled.map((c, i) => {
            const card = cards.get(c.card_id)
            const out = i < shown
            return (
              <div key={i} className="mx-auto w-full max-w-[230px]">
                {out && card ? (
                  <div className="pack-pop">
                    <CardCanvas card={card} look={RARITY_LOOK[c.rarity]} label={rarityName(c.rarity, false).toUpperCase()} scale={0.7} avatar={avatars[c.card_id]} className="w-full rounded-2xl drop-shadow-[0_10px_24px_rgba(0,0,0,0.6)]" />
                    <p className={`mt-2 text-center text-sm font-bold uppercase tracking-wide ${RARITY_INFO[c.rarity].text}`}>{rarityName(c.rarity, de)}</p>
                  </div>
                ) : (
                  <div className="flex aspect-[570/730] items-center justify-center rounded-2xl border-2 border-accent/50 bg-gradient-to-br from-base-800 to-base-900 shadow-xl">
                    <img src="/logo.png" alt="" className="h-16 w-16 opacity-60" />
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <div className="mt-6 flex flex-col items-center gap-2">
          {shown >= pulled.length && (
            <p className="text-sm text-slate-300">
              {de ? 'Beste Karte:' : 'Best card:'} <span className={`font-bold uppercase ${RARITY_INFO[best].text}`}>{rarityName(best, de)}</span>
            </p>
          )}
          <button type="button" onClick={onClose} className="btn-accent !px-8 text-sm">
            {shown >= pulled.length ? (de ? 'Weiter' : 'Continue') : de ? 'Überspringen' : 'Skip'}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Collector: the boosters of a member and the cards they collected, by rarity. */
export default function Collection() {
  const { profile } = useProfile()
  const { language } = useLanguage()
  const de = language === 'de'
  const params = useParams()
  const id = params.id ?? profile?.openfront_id
  const isOwn = !!id && id === profile?.openfront_id
  const isAdmin = useIsAdmin()
  const { cards, loading } = useCardData()
  const [collection, setCollection] = useState<{ openedTotal: number; cards: CollectedCard[] } | null | undefined>(undefined)
  const state = useBoosterState()
  const [avatars, setAvatars] = useState<Avatars>({})
  const [opened, setOpened] = useState<PulledCard[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [filter, setFilter] = useState<Rarity | 'all'>('all')
  const [showAll, setShowAll] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [grantTo, setGrantTo] = useState('')
  const [grantCount, setGrantCount] = useState(1)

  const reload = useCallback(async () => {
    if (!id) return
    setCollection(await fetchCollection(id))
    if (isOwn) await refreshBoosterState()
  }, [id, isOwn])
  useEffect(() => {
    setCollection(undefined)
    void reload()
  }, [reload])
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  // a new profile picture shows on the cards at once
  useEffect(() => {
    const on = () => setAvatars({})
    window.addEventListener(EXTRAS_CHANGED, on)
    return () => window.removeEventListener(EXTRAS_CHANGED, on)
  }, [])

  // the pictures of the members whose cards are shown (the collection and a booster that was just opened)
  const wanted = useMemo(() => [...new Set([...(collection?.cards ?? []).map((c) => c.card_id), ...(opened ?? []).map((c) => c.card_id)])].filter((x) => !avatars[x]), [collection, opened, avatars])
  useEffect(() => {
    if (wanted.length === 0) return
    let alive = true
    void fetchAvatars(wanted).then((a) => alive && setAvatars((prev) => ({ ...prev, ...a })))
    return () => {
      alive = false
    }
  }, [wanted])

  if (!profile) return <RegistrationGate />
  if (loading || !cards || collection === undefined) return <Spinner label={de ? 'Lade die Sammlung …' : 'Loading the collection …'} />
  const owner = id ? cards.get(id) : undefined

  async function open() {
    setBusy(true)
    setMessage(null)
    const r = await openBooster()
    setBusy(false)
    if (!r.ok) {
      setMessage(r.error === 'no_booster' ? (de ? 'Kein Booster mehr übrig.' : 'No booster left.') : de ? 'Das hat nicht geklappt. Versuch es gleich noch einmal.' : 'That did not work. Try again in a moment.')
      void reload()
      return
    }
    setBoosterState(r.state)
    window.dispatchEvent(new Event(QUESTS_CHANGED)) // the daily quest may be claimable now
    setOpened(r.cards)
  }
  async function grant() {
    setMessage(null)
    const problem = await grantBoosters(grantTo, grantCount)
    setMessage(problem ? (de ? `Nicht vergeben (${problem}).` : `Not granted (${problem}).`) : de ? `${grantCount} Booster vergeben.` : `${grantCount} booster(s) granted.`)
  }

  const all = collection?.cards ?? []
  const perRarity = Object.fromEntries(RARITIES.map((r) => [r, all.filter((c) => c.rarity === r).reduce((n, c) => n + c.n, 0)])) as Record<Rarity, number>
  const distinct = new Set(all.map((c) => c.card_id)).size
  const list = all
    .filter((c) => filter === 'all' || c.rarity === filter)
    .filter((c) => cards.has(c.card_id))
    .sort((a, b) => RARITIES.indexOf(b.rarity) - RARITIES.indexOf(a.rarity) || (cards.get(b.card_id)?.overall ?? 0) - (cards.get(a.card_id)?.overall ?? 0))
  const shown = showAll ? list : list.slice(0, TILES_SHOWN)
  const canOpen = boostersReady(state) > 0

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      {opened && <PackReveal pulled={opened} cards={cards} avatars={avatars} de={de} onClose={() => { setOpened(null); void reload() }} />}
      <Link to={`/member/${id}`} className="text-sm text-slate-400 hover:text-white">
        ← {de ? 'Zum Profil' : 'To the profile'}
      </Link>
      <SectionHeading center eyebrow="Collector" title={isOwn ? (de ? 'Meine Sammlung' : 'My collection') : de ? `Sammlung von ${owner?.name ?? id}` : `${owner?.name ?? id}'s collection`} />

      {isOwn && (
        <div className="panel grid items-center gap-5 p-5 sm:grid-cols-[180px_minmax(0,1fr)]">
          <div className="mx-auto flex aspect-[3/4] w-36 flex-col items-center justify-center rounded-2xl border-2 border-gold/60 bg-gradient-to-br from-accent/60 via-base-800 to-gold/30 p-3 text-center shadow-xl sm:w-full">
            <img src="/logo.png" alt="" className="h-14 w-14" />
            <p className="mt-2 font-display text-lg font-bold tracking-widest text-gold-light">BOOSTER</p>
            <p className="text-[10px] uppercase tracking-wide text-slate-300">{de ? '3 Karten' : '3 cards'}</p>
          </div>
          <div className="space-y-3">
            <div className="space-y-1 text-sm">
              <p className={state?.freeAvailable ? 'font-semibold text-signal-green' : 'text-slate-300'}>
                {de ? 'Gratis-Booster des Tages: ' : 'Free booster of the day: '}
                {state?.freeAvailable ? (de ? 'bereit' : 'ready') : state?.nextFreeAt ? (de ? `wieder in ${countdown(state.nextFreeAt, now)}` : `back in ${countdown(state.nextFreeAt, now)}`) : '…'}
              </p>
              <p className="text-slate-300">
                {de ? 'Weitere Booster: ' : 'More boosters: '}
                <span className="font-bold text-white">{state?.extra ?? 0}</span>
              </p>
              <p className="text-xs text-slate-500">{de ? `Bisher geöffnet: ${collection?.openedTotal ?? 0}. Mehr Booster gibt es bei besonderen Aktionen.` : `Opened so far: ${collection?.openedTotal ?? 0}. More boosters come with special occasions.`}</p>
            </div>
            <button type="button" onClick={() => void open()} disabled={busy || !canOpen} className={`btn-accent !px-7 text-sm disabled:opacity-50 ${canOpen && !busy ? 'glow-ready' : ''}`}>
              {busy ? '…' : de ? 'Booster öffnen' : 'Open a booster'}
            </button>
            {message && <p className="text-sm text-slate-300">{message}</p>}
            <p className="text-xs text-slate-500">{de ? 'Die tägliche Quest „Booster-Zeit“ gibt XP, wenn du einen Booster öffnest.' : 'The daily quest "Booster Time" gives XP when you open a booster.'}</p>
          </div>
        </div>
      )}

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-300">
            {de ? `${distinct} von ${cards.size} Mitgliedern gesammelt` : `${distinct} of ${cards.size} members collected`}
            <span className="ml-2 text-xs text-slate-500">· {all.reduce((n, c) => n + c.n, 0)} {de ? 'Karten' : 'cards'}</span>
          </p>
          <Link to={`/card/${id}`} className="text-sm font-semibold text-accent-light hover:text-accent">
            {de ? 'Eigene Karte ansehen →' : 'See the own card →'}
          </Link>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <button type="button" onClick={() => { setFilter('all'); setShowAll(false) }} className={`rounded-full border px-3 py-1 ${filter === 'all' ? 'border-gold bg-gold/15 text-gold-light' : 'border-base-600 text-slate-400 hover:text-white'}`}>
            {de ? 'Alle' : 'All'}
          </button>
          {RARITIES.map((r) => (
            <button key={r} type="button" onClick={() => { setFilter(r); setShowAll(false) }} className={`rounded-full border px-3 py-1 ${filter === r ? `${RARITY_INFO[r].border} bg-base-800 ${RARITY_INFO[r].text}` : 'border-base-600 text-slate-400 hover:text-white'}`}>
              {rarityName(r, de)} <span className="tabular-nums">{perRarity[r]}</span>
            </button>
          ))}
        </div>
        {all.length === 0 ? (
          <p className="panel px-5 py-10 text-center text-sm text-slate-500">{isOwn ? (de ? 'Noch keine Karten. Öffne deinen ersten Booster!' : 'No cards yet. Open your first booster!') : de ? 'Noch keine Karten gesammelt.' : 'No cards collected yet.'}</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
              {shown.map((c: CollectedCard) => {
                const card = cards.get(c.card_id)!
                return (
                  <div key={`${c.card_id}-${c.rarity}`} className="relative">
                    <CardCanvas card={card} look={RARITY_LOOK[c.rarity]} label={rarityName(c.rarity, false).toUpperCase()} scale={0.55} avatar={avatars[c.card_id]} className="w-full rounded-xl drop-shadow-[0_6px_14px_rgba(0,0,0,0.5)]" />
                    {c.n > 1 && <span className="absolute right-1.5 top-1.5 rounded-full bg-base-950/85 px-2 py-0.5 text-xs font-bold text-white">×{c.n}</span>}
                  </div>
                )
              })}
            </div>
            {list.length > TILES_SHOWN && (
              <div className="flex justify-center">
                <button type="button" onClick={() => setShowAll((v) => !v)} className="btn-ghost text-sm">
                  {showAll ? (de ? 'Weniger anzeigen' : 'Show less') : de ? `Alle ${list.length} anzeigen` : `Show all ${list.length}`}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <div className="panel p-4 text-xs text-slate-400 sm:p-5">
        <p className="mb-2 font-semibold uppercase tracking-wide text-slate-300">{de ? 'Wie oft kommt was vor' : 'How common each one is'}</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {RARITIES.map((r) => (
            <span key={r}>
              <span className={`font-bold ${RARITY_INFO[r].text}`}>{rarityName(r, de)}</span> {RARITY_INFO[r].chance} %
            </span>
          ))}
        </div>
        <p className="mt-2">{de ? 'Jedes Mitglied hat eine eigene Karte, die sich mit seinen Werten ändert. Neue Mitglieder sind sofort in den Boostern.' : 'Every member has their own card that changes with their stats. New members are in the boosters at once.'}</p>
      </div>

      {isOwn && isAdmin && (
        <div className="panel space-y-3 p-4 sm:p-5">
          <h3 className="font-display text-lg font-bold text-white">{de ? 'Admin: Booster vergeben' : 'Admin: grant boosters'}</h3>
          <div className="flex flex-wrap items-center gap-2">
            <select value={grantTo} onChange={(e) => setGrantTo(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-base-600 bg-base-800 px-3 py-2 text-sm text-white">
              <option value="">{de ? 'Mitglied wählen …' : 'Choose a member …'}</option>
              {[...cards.values()].sort((a, b) => a.name.localeCompare(b.name)).map((c) => (
                <option key={c.publicId} value={c.publicId}>
                  {c.name}
                </option>
              ))}
            </select>
            <input type="number" min={1} max={50} value={grantCount} onChange={(e) => setGrantCount(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} className="w-20 rounded-lg border border-base-600 bg-base-800 px-3 py-2 text-sm text-white" aria-label={de ? 'Anzahl' : 'Count'} />
            <button type="button" onClick={() => void grant()} disabled={!grantTo} className="btn-accent !px-5 !py-2 text-sm disabled:opacity-50">
              {de ? 'Vergeben' : 'Grant'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
