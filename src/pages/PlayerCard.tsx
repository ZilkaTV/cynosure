import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { RegistrationGate } from '../components/StatsShell'
import { SectionHeading, Spinner } from '../components/ui'
import { useLanguage } from '../i18n/LanguageContext'
import { drawPlayerCard } from '../lib/drawPlayerCard'
import { loadCardAssets, loadCardFonts } from '../lib/cardImages'
import { CARD_STATS, TIER_FROM, type CardMeasures, type CardPart, type CardStat } from '../lib/playerCard'
import { berlinMonth, nextUpdateDate, updateCardSnapshot } from '../lib/cardSnapshots'
import { EXTRAS_CHANGED, avatarSrc, fetchProfileExtras, profileImageSrc } from '../lib/profileExtras'
import { useCardData } from '../lib/useCardData'
import { useProfile } from '../lib/useProfile'

const WHAT: Record<CardStat, { de: string; en: string; name: { de: string; en: string } }> = {
  COM: { name: { de: 'Kommunikation', en: 'Communication' }, de: 'Kommentare und Reaktionen auf der Seite und Quest-XP', en: 'comments and reactions on the site and quest XP' },
  INT: { name: { de: 'Intelligenz', en: 'Intelligence' }, de: 'Ranked-Elo in 1v1, 2v2 und das FFA Rating (alle drei zählen gleich; wer in einer Top 100 fehlt, zählt dort als Letzter)', en: 'ranked Elo in 1v1, 2v2 and the FFA Rating (all three count the same; not being in a top 100 counts as last place there)' },
  ECO: { name: { de: 'Wirtschaft', en: 'Economy' }, de: 'Gold pro Minute und gespendete Caps', en: 'gold per minute and donated caps' },
  SPE: { name: { de: 'Tempo', en: 'Speed' }, de: 'Speedrun-Zeit und Gebietsanteil nach 3 Minuten', en: 'speedrun time and tile share after 3 minutes' },
  DEF: { name: { de: 'Verteidigung', en: 'Defense' }, de: 'Team-Win-Score und erhaltene Angriffe pro Minute', en: 'team win score and attacks received per minute' },
  ATK: { name: { de: 'Angriff', en: 'Attack' }, de: 'Kills pro Spiel und Truppen im Angriff pro Minute', en: 'kills per game and troops sent per minute' },
}

const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`
const num = (v: number, digits = 0) => v.toLocaleString(undefined, { maximumFractionDigits: digits })
/** What each measure is called and how its raw number is written. */
const PART: Record<keyof CardMeasures, { de: string; en: string; fmt: (v: number) => string }> = {
  social: { de: 'Kommentare und Reaktionen', en: 'Comments and reactions', fmt: (v) => num(v) },
  xp: { de: 'Quest-XP', en: 'Quest XP', fmt: (v) => num(v) },
  winRate: { de: 'Siegquote (Ersatz, keine Team-Spiele)', en: 'Win rate (stand-in, no team games)', fmt: (v) => `${num(v * 100, 1)} %` },
  elo1v1: { de: '1v1 Elo', en: '1v1 Elo', fmt: (v) => num(v) },
  elo2v2: { de: '2v2 Elo', en: '2v2 Elo', fmt: (v) => num(v) },
  eloFfa: { de: 'FFA Rating', en: 'FFA Rating', fmt: (v) => num(v) },
  goldPerMin: { de: 'Gold pro Minute', en: 'Gold per minute', fmt: (v) => num(v, 1) },
  caps: { de: 'Gespendete Caps', en: 'Donated caps', fmt: (v) => num(v) },
  speedrunSeconds: { de: 'Speedrun-Zeit', en: 'Speedrun time', fmt: mmss },
  tiles3min: { de: 'Gebietsanteil nach 3 Minuten', en: 'Tile share after 3 minutes', fmt: (v) => `${num(v, 1)} %` },
  teamScore: { de: 'Team-Win-Score', en: 'Team win score', fmt: (v) => num(v) },
  troopsIn: { de: 'Erhaltene Angriffe pro Minute', en: 'Attacks received per minute', fmt: (v) => num(v, 1) },
  kills: { de: 'Kills pro Spiel', en: 'Kills per game', fmt: (v) => num(v, 1) },
  troopsOut: { de: 'Truppen im Angriff pro Minute', en: 'Troops sent per minute', fmt: (v) => num(v, 1) },
}

/** One measure of a value: its number, the place among the members and the points it brought. */
function PartRow({ part, de }: { part: CardPart; de: boolean }) {
  const label = PART[part.key][de ? 'de' : 'en']
  const counted = part.points != null
  let note = ''
  if (part.value != null) note = de ? `besser als ${Math.round((part.place ?? 0) * 100)} % der Mitglieder` : `better than ${Math.round((part.place ?? 0) * 100)} % of the members`
  else if (counted) note = de ? 'nicht in der Top 100, zählt als letzter Platz' : 'not in the top 100, counts as last place'
  else note = de ? 'keine Daten, zählt nicht' : 'no data, does not count'
  return (
    <li className="flex items-baseline gap-2 text-xs">
      <span className="min-w-0 flex-1">
        <span className="text-slate-300">{label}</span>
        {part.value != null && <span className="ml-1.5 font-semibold tabular-nums text-white">{PART[part.key].fmt(part.value)}</span>}
        <span className="block text-[11px] text-slate-500">{note}</span>
      </span>
      <span className="shrink-0 tabular-nums text-slate-400">
        {counted ? (
          <>
            <span className="font-semibold text-white">{num(part.points!, 1)}</span> / {num(part.max, 1)} {de ? 'Pkt' : 'pts'}
          </>
        ) : (
          '–'
        )}
      </span>
    </li>
  )
}

/** "My card": a player card in our own design, built from the stats of the site, saved as a picture. */
export default function PlayerCard() {
  const { profile } = useProfile()
  const { language } = useLanguage()
  const de = language === 'de'
  const params = useParams()
  const id = params.id ?? profile?.openfront_id
  const { cards, live, loading, reloadSnapshots } = useCardData()
  const [updating, setUpdating] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  // the picture of the member; when it cannot be read the card is drawn with the silhouette
  const [picture, setPicture] = useState<{ src: string | null; fit: string | null } | undefined>(undefined)
  useEffect(() => {
    setPicture(undefined)
    if (!id) return
    let alive = true
    const load = () => void fetchProfileExtras(id).then((e) => alive && setPicture({ src: avatarSrc(id, e?.avatar_url, e?.discord_avatar), fit: profileImageSrc(e?.avatar_url) ? (e?.avatar_fit ?? null) : null }))
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
  const thisMonth = berlinMonth()
  const canUpdate = isOwn && card.updatedMonth !== thisMonth
  const liveCard = live?.get(card.publicId)
  const nextUpdate = nextUpdateDate().toLocaleDateString(de ? 'de-DE' : 'en-GB', { day: 'numeric', month: 'long' })

  async function update() {
    if (!liveCard) return
    setUpdating(true)
    setNote(null)
    const problem = await updateCardSnapshot(liveCard.stats)
    if (problem) {
      setUpdating(false)
      setNote(
        problem === 'already_updated'
          ? de ? 'Diesen Monat hast du die Karte schon aktualisiert.' : 'You already updated the card this month.'
          : problem === 'too_big'
            ? de ? 'Die Werte haben sich zu stark verändert. Melde dich bei einem Admin.' : 'The values changed too much. Ask an admin.'
            : de ? 'Das hat nicht geklappt. Versuch es gleich noch einmal.' : 'That did not work. Try again in a moment.',
      )
      return
    }
    await reloadSnapshots()
    setUpdating(false)
    setNote(de ? 'Karte aktualisiert.' : 'Card updated.')
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
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
          {isOwn && (
            <div className="panel space-y-2 p-3 text-center">
              <button type="button" onClick={() => void update()} disabled={!canUpdate || updating || !liveCard} className={`btn-accent w-full text-sm disabled:opacity-50 ${canUpdate && !updating ? 'glow-ready' : ''}`}>
                {updating ? '…' : de ? 'Karte trainieren' : 'Train your card'}
              </button>
              <p className="text-[11px] text-slate-400">
                {canUpdate
                  ? card.updatedMonth
                    ? de ? 'Du kannst deine Karte diesen Monat aktualisieren und siehst dann, was sich geändert hat.' : 'You can update your card this month and then see what changed.'
                    : de ? 'Deine erste Aktualisierung: sie speichert die Werte, ab dann siehst du jeden Monat die Veränderung.' : 'Your first update: it saves the values, from then on you see the change every month.'
                  : de ? `Schon aktualisiert. Die nächste Aktualisierung ist ab dem ${nextUpdate} möglich.` : `Already updated. The next update is possible from ${nextUpdate}.`}
              </p>
              {note && <p className="text-xs text-slate-300">{note}</p>}
            </div>
          )}
        </div>
        <div className="space-y-5">
          <div className="panel p-4 sm:p-5">
            <h3 className="mb-3 font-display text-lg font-bold text-white">{de ? 'So kommen die Werte zustande' : 'Where the values come from'}</h3>
            <p className="mb-3 text-sm text-slate-400">
              {de
                ? 'Jeder Wert (46 bis 99) zeigt, wo du unter allen Mitgliedern liegst. Er besteht aus zwei bis drei Messwerten, die gleich viel zählen (bei Intelligenz je ein Drittel, also bis zu 33 Punkte pro Ladder). Wer bei einem Messwert Letzter ist, bekommt dafür noch den Sockel von 46 geteilt durch die Anzahl, wer Erster ist, den vollen Anteil. Alles kommt aus den Daten der Seite, nichts wird von Hand eingetragen. Die Gesamtwertung ist der Durchschnitt der sechs Werte.'
                : 'Every value (46 to 99) shows where you stand among all members. It is made of two or three measures that count the same (Intelligence: a third each, so up to 33 points per ladder). Being last in a measure still gives the base of 46 divided by their number, being first gives the full share. It all comes from the data of the site, nothing is typed in. The overall rating is the average of the six values.'}
            </p>
            <ul className="grid gap-3 text-sm lg:grid-cols-2">
              {CARD_STATS.map((s) => {
                const parts = card.parts?.[s] ?? []
                const max = parts.find((p) => p.points != null)?.max ?? 0
                const liveValue = card.live?.[s]
                return (
                  <li key={s} className="rounded-lg border border-base-700/60 bg-base-900/30 p-3">
                    <div className="flex items-center gap-3">
                      <span className="w-10 shrink-0 font-display font-bold text-gold-light">{s}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-slate-200">{WHAT[s].name[de ? 'de' : 'en']}</span>
                        <span className="block text-xs text-slate-500">
                          {WHAT[s][de ? 'de' : 'en']}
                          {card.noData[s] ? (de ? ' · noch keine Daten (zählt als 50)' : ' · no data yet (counts as 50)') : ''}
                        </span>
                      </span>
                      <span className="shrink-0 font-display text-xl font-bold tabular-nums text-white">
                        {card.stats[s]}
                        {!!card.delta?.[s] && <span className={`ml-2 text-sm ${card.delta[s] > 0 ? 'text-signal-green' : 'text-signal-red'}`}>{card.delta[s] > 0 ? `+${card.delta[s]}` : `\u2212${Math.abs(card.delta[s])}`}</span>}
                      </span>
                    </div>
                    {parts.length > 0 && !card.noData[s] && (
                      <div className="mt-2 rounded-lg border border-base-700/70 bg-base-900/40 px-3 py-2">
                        <p className="mb-1.5 text-[11px] text-slate-500">
                          {de ? `Jeder Messwert bringt bis zu ${num(max, 1)} Punkte, zusammen ergeben sie den Wert.` : `Every measure brings up to ${num(max, 1)} points, together they make the value.`}
                        </p>
                        <ul className="space-y-1.5">
                          {parts.map((p) => (
                            <PartRow key={p.key} part={p} de={de} />
                          ))}
                        </ul>
                        {liveValue != null && liveValue !== card.stats[s] && (
                          <p className="mt-1.5 text-[11px] text-slate-500">
                            {de ? `Diese Punkte sind die aktuellen Werte (jetzt ${liveValue}). Deine Karte zeigt ${card.stats[s]} vom letzten Training.` : `These points are the current values (now ${liveValue}). Your card shows ${card.stats[s]} from the last training.`}
                          </p>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
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
              {de ? 'Einmal im Monat kannst du deine Karte trainieren: Sie übernimmt deine aktuellen Werte, und du siehst grün, was besser wurde, und rot, was schlechter wurde. Mit einem eigenen Profilbild sieht sie am besten aus.' : 'Once a month you can train your card: it takes your current values and you see in green what got better and in red what got worse. It looks best with your own profile picture.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
