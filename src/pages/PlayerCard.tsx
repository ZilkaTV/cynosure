import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { RegistrationGate } from '../components/StatsShell'
import { SectionHeading, Spinner } from '../components/ui'
import { useLanguage } from '../i18n/LanguageContext'
import { drawPlayerCard } from '../lib/drawPlayerCard'
import { loadCardAssets, loadCardFonts } from '../lib/cardImages'
import { CARD_STATS, TIER_FROM, type CardStat } from '../lib/playerCard'
import { EXTRAS_CHANGED, fetchProfileExtras, profileImageSrc } from '../lib/profileExtras'
import { useCardData } from '../lib/useCardData'
import { useProfile } from '../lib/useProfile'

const WHAT: Record<CardStat, { de: string; en: string; name: { de: string; en: string } }> = {
  COM: { name: { de: 'Kommunikation', en: 'Communication' }, de: 'Kommentare und Reaktionen auf der Seite und Quest-XP', en: 'comments and reactions on the site and quest XP' },
  INT: { name: { de: 'Intelligenz', en: 'Intelligence' }, de: 'Siegquote und bestes Ranked-Elo', en: 'win rate and best ranked Elo' },
  ECO: { name: { de: 'Wirtschaft', en: 'Economy' }, de: 'Gold pro Minute und gespendete Caps', en: 'gold per minute and donated caps' },
  SPE: { name: { de: 'Tempo', en: 'Speed' }, de: 'Speedrun-Zeit und Gebietsanteil nach 3 Minuten', en: 'speedrun time and tile share after 3 minutes' },
  DEF: { name: { de: 'Verteidigung', en: 'Defense' }, de: 'Siegquote in Team-Spielen und abgewehrte Angriffe pro Minute', en: 'team win rate and attacks received per minute' },
  ATK: { name: { de: 'Angriff', en: 'Attack' }, de: 'Kills pro Spiel und Truppen im Angriff pro Minute', en: 'kills per game and troops sent per minute' },
}

/** "My card": a player card in our own design, built from the stats of the site, saved as a picture. */
export default function PlayerCard() {
  const { profile } = useProfile()
  const { language } = useLanguage()
  const de = language === 'de'
  const params = useParams()
  const id = params.id ?? profile?.openfront_id
  const { cards, loading } = useCardData()
  // the picture of the member; when it cannot be read the card is drawn with the silhouette
  const [picture, setPicture] = useState<{ src: string | null; fit: string | null } | undefined>(undefined)
  useEffect(() => {
    setPicture(undefined)
    if (!id) return
    let alive = true
    const load = () => void fetchProfileExtras(id).then((e) => alive && setPicture({ src: profileImageSrc(e?.avatar_url), fit: e?.avatar_fit ?? null }))
    load()
    // a new profile picture shows on the card at once
    window.addEventListener(EXTRAS_CHANGED, load)
    return () => {
      alive = false
      window.removeEventListener(EXTRAS_CHANGED, load)
    }
  }, [id])
  const canvas = useRef<HTMLCanvasElement>(null)
  const [drawn, setDrawn] = useState(false)

  const card = id ? cards?.get(id) : undefined

  useEffect(() => {
    if (!card || !canvas.current || picture === undefined) return
    let alive = true
    void (async () => {
      await loadCardFonts()
      const assets = await loadCardAssets(card.nationality, picture.src ? { src: picture.src, fit: picture.fit } : null)
      if (!alive || !canvas.current) return
      drawPlayerCard(canvas.current, card, assets)
      setDrawn(true)
    })()
    return () => {
      alive = false
    }
  }, [card, picture])

  if (!profile) return <RegistrationGate />
  if (loading || !cards) return <Spinner label={de ? 'Lade die Werte …' : 'Loading the values …'} />
  if (!card) {
    return (
      <div className="mx-auto max-w-xl py-10 text-center text-slate-400">
        {de ? 'Für dieses Profil gibt es keine Karte.' : 'There is no card for this profile.'}{' '}
        <Link to="/" className="text-accent-light hover:underline">
          {de ? 'Zur Übersicht' : 'Back to the overview'}
        </Link>
      </div>
    )
  }

  function download() {
    canvas.current?.toBlob((blob) => {
      if (!blob || !card) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `cyn-card-${card.name.replace(/[^A-Za-z0-9_-]+/g, '_')}.png`
      a.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 2000)
    }, 'image/png')
  }
  const isOwn = id === profile.openfront_id

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link to={`/member/${card.publicId}`} className="text-sm text-slate-400 hover:text-white">
        ← {de ? 'Zum Profil' : 'To the profile'}
      </Link>
      <SectionHeading center eyebrow={de ? 'Spielerkarte' : 'Player card'} title={isOwn ? (de ? 'Meine Karte' : 'My card') : card.name} />
      <div className="grid items-start gap-8 md:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <div className="mx-auto w-full max-w-[320px] space-y-3">
          <canvas ref={canvas} className="w-full rounded-2xl" style={{ aspectRatio: '570 / 730', filter: 'drop-shadow(0 12px 28px rgba(0,0,0,0.5))' }} aria-label={`${card.name}, ${card.overall}`} />
          <button type="button" onClick={download} disabled={!drawn} className="btn-accent w-full text-sm disabled:opacity-50">
            {de ? 'Als PNG speichern' : 'Save as PNG'}
          </button>
          <p className="text-center text-[11px] text-slate-500">{de ? 'Lade das Bild herunter und teile es zum Beispiel in Discord.' : 'Download the picture and share it, for example in Discord.'}</p>
        </div>
        <div className="space-y-5">
          <div className="panel p-4 sm:p-5">
            <h3 className="mb-3 font-display text-lg font-bold text-white">{de ? 'So kommen die Werte zustande' : 'Where the values come from'}</h3>
            <p className="mb-3 text-sm text-slate-400">
              {de
                ? 'Jeder Wert (46 bis 99) zeigt, wo du unter allen Mitgliedern liegst. Er kommt aus den Daten der Seite, nichts wird von Hand eingetragen. Die Gesamtwertung ist der Durchschnitt der sechs Werte.'
                : 'Every value (46 to 99) shows where you stand among all members. It comes from the data of the site, nothing is typed in. The overall rating is the average of the six values.'}
            </p>
            <ul className="divide-y divide-base-700/60 text-sm">
              {CARD_STATS.map((s) => (
                <li key={s} className="flex items-center gap-3 py-2">
                  <span className="w-10 shrink-0 font-display font-bold text-gold-light">{s}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-slate-200">{WHAT[s].name[de ? 'de' : 'en']}</span>
                    <span className="block text-xs text-slate-500">
                      {WHAT[s][de ? 'de' : 'en']}
                      {card.noData[s] ? (de ? ' · noch keine Daten (zählt als 50)' : ' · no data yet (counts as 50)') : ''}
                    </span>
                  </span>
                  <span className="shrink-0 font-display text-xl font-bold tabular-nums text-white">{card.stats[s]}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="panel p-4 sm:p-5">
            <h3 className="mb-2 font-display text-lg font-bold text-white">{de ? 'Stufen' : 'Tiers'}</h3>
            <div className="flex flex-wrap gap-2 text-xs font-semibold">
              {[...TIER_FROM].reverse().map(([min, tier], i, list) => {
                const max = i + 1 < list.length ? list[i + 1][0] - 1 : 99
                return (
                  <span key={tier} className={`rounded-full border px-3 py-1 uppercase ${tier === card.tier ? 'border-gold bg-gold/15 text-gold-light' : 'border-base-600 text-slate-400'}`}>
                    {tier} {Math.max(min, 46)}-{max}
                  </span>
                )
              })}
            </div>
            <p className="mt-3 text-xs text-slate-500">
              {de ? 'Neue Daten (Spiele, Chat, Spenden) ändern die Karte. Mit einem eigenen Profilbild sieht sie am besten aus.' : 'New data (games, chat, donations) changes the card. It looks best with your own profile picture.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
