import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import CardCanvas from './CardCanvas'
import { useLanguage } from '../i18n/LanguageContext'
import { FEATURED_CHANGED, fetchFeatured, RARITY_INFO, type PulledCard } from '../lib/boosters'
import { RARITY_LOOK } from '../lib/drawPlayerCard'
import { fetchAvatars, type Fit } from '../lib/profileExtras'
import { useCardData } from '../lib/useCardData'

type Avatars = Record<string, { src: string; fit: Fit | null }>

/**
 * The card on the right of a profile: the member's own card first, then the cards the member picked in the collection (the tick on a card).
 * Swipe (or drag) left and right, or use the arrows, to go through them.
 */
export default function ProfileCards({ memberId }: { memberId: string }) {
  const { language } = useLanguage()
  const de = language === 'de'
  const { cards } = useCardData()
  const [featured, setFeatured] = useState<PulledCard[]>([])
  const [avatars, setAvatars] = useState<Avatars>({})
  const [i, setI] = useState(0)
  const drag = useRef<{ x: number; moved: boolean } | null>(null)

  useEffect(() => {
    let alive = true
    const load = () => void fetchFeatured(memberId).then((list) => alive && setFeatured(list))
    load()
    window.addEventListener(FEATURED_CHANGED, load)
    return () => {
      alive = false
      window.removeEventListener(FEATURED_CHANGED, load)
    }
  }, [memberId])

  const slides = useMemo(() => {
    const out: { id: string; rarity: PulledCard['rarity'] | null }[] = []
    if (cards?.has(memberId)) out.push({ id: memberId, rarity: null })
    for (const f of featured) if (cards?.has(f.card_id)) out.push({ id: f.card_id, rarity: f.rarity })
    return out
  }, [cards, featured, memberId])

  // each member is asked for once: a member without a picture gets no entry in avatars and must not be asked for again and again
  const asked = useRef(new Set<string>())
  const wanted = useMemo(() => [...new Set(slides.map((s) => s.id))].filter((x) => !avatars[x] && !asked.current.has(x)), [slides, avatars])
  useEffect(() => {
    if (!wanted.length) return
    for (const x of wanted) asked.current.add(x)
    void fetchAvatars(wanted).then((a) => setAvatars((prev) => ({ ...prev, ...a })))
  }, [wanted])

  if (slides.length === 0) return null
  const at = Math.min(i, slides.length - 1)
  const slide = slides[at]
  const card = cards!.get(slide.id)!
  const go = (d: number) => setI((at + d + slides.length) % slides.length)
  const fx = slide.rarity === 'ultra' ? 'reveal-ultra' : slide.rarity === 'legendary' ? 'reveal-legendary' : ''

  return (
    <div className="w-[170px] select-none">
      {/* the same height for every page, so the card does not jump when the caption has a second line */}
      <p className="mb-1.5 flex h-8 flex-col items-center justify-end text-center text-[11px] font-bold uppercase leading-tight tracking-[0.2em] text-gold-light drop-shadow">
        <span>{slide.rarity ? (de ? 'Lieblingskarte' : 'Favorite card') : de ? 'Eigene Karte' : 'Own card'}</span>
        {slide.rarity && <span className="text-[10px] text-slate-300">{RARITY_INFO[slide.rarity][de ? 'de' : 'en']}</span>}
      </p>
      <div
        className="touch-pan-y"
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, moved: false }
        }}
        onPointerMove={(e) => {
          if (drag.current && Math.abs(e.clientX - drag.current.x) > 8) drag.current.moved = true
        }}
        onPointerUp={(e) => {
          const d = drag.current
          drag.current = null
          if (d && slides.length > 1 && Math.abs(e.clientX - d.x) > 40) go(e.clientX < d.x ? 1 : -1)
        }}
        onPointerCancel={() => (drag.current = null)}
        onClickCapture={(e) => {
          // a swipe is not a click on the card
          if (drag.current?.moved) e.preventDefault()
        }}
      >
        <Link to={`/card/${slide.id}`} draggable={false} className={`relative block ${fx}`} title={de ? 'Karte ansehen' : 'View the card'}>
          <div key={`${slide.id}-${slide.rarity}`} className="reveal-card relative rounded-xl">
            <CardCanvas
              card={card}
              look={slide.rarity ? RARITY_LOOK[slide.rarity] : undefined}
              label={slide.rarity ? RARITY_INFO[slide.rarity].en.toUpperCase() : undefined}
              scale={0.6}
              avatar={avatars[slide.id]}
              className="pointer-events-none w-full rounded-xl drop-shadow-[0_8px_18px_rgba(0,0,0,0.6)]"
            />
            {(slide.rarity === 'ultra' || slide.rarity === 'legendary') && (
              <span className="reveal-fx" style={{ borderRadius: '0.75rem' }} aria-hidden>
                <span className="reveal-shine" />
                <span className="reveal-glint" />
              </span>
            )}
          </div>
        </Link>
      </div>
      {slides.length > 1 && (
        <div className="mt-2 flex items-center justify-center gap-2">
          <button type="button" onClick={() => go(-1)} className="rounded-md px-1.5 text-lg leading-none text-slate-300 hover:text-white" aria-label={de ? 'Vorherige Karte' : 'Previous card'}>
            ‹
          </button>
          {slides.map((s, n) => (
            <button key={`${s.id}-${s.rarity}`} type="button" onClick={() => setI(n)} className={`h-1.5 rounded-full transition-all ${n === at ? 'w-4 bg-gold-light' : 'w-1.5 bg-base-500 hover:bg-base-400'}`} aria-label={String(n + 1)} />
          ))}
          <button type="button" onClick={() => go(1)} className="rounded-md px-1.5 text-lg leading-none text-slate-300 hover:text-white" aria-label={de ? 'Nächste Karte' : 'Next card'}>
            ›
          </button>
        </div>
      )}
    </div>
  )
}
