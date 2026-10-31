import { useEffect, useRef } from 'react'
import { drawPlayerCard, type CardLook } from '../lib/drawPlayerCard'
import { loadCardAssets, loadCardFonts } from '../lib/cardImages'
import type { Fit } from '../lib/profileExtras'
import type { PlayerCardData } from '../lib/playerCard'

/** A player card as a picture. `scale` is the pixel density (the small cards of a collection use less). */
export default function CardCanvas({
  card,
  look,
  label,
  scale = 1,
  deltas,
  avatar,
  className = '',
  onDrawn,
}: {
  card: PlayerCardData
  look?: CardLook
  label?: string
  scale?: number
  /** the green + and red - numbers of the last update */
  deltas?: boolean
  avatar?: { src: string; fit: Fit | string | null } | null
  className?: string
  onDrawn?: () => void
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let alive = true
    void (async () => {
      await loadCardFonts()
      const assets = await loadCardAssets(card.nationality, avatar)
      if (!alive || !ref.current) return
      drawPlayerCard(ref.current, card, assets, { look, label, scale, deltas })
      onDrawn?.()
    })()
    return () => {
      alive = false
    }
    // the picture of the avatar is part of the dependencies by its address
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card, look, label, scale, deltas, avatar?.src, avatar?.fit])
  return <canvas ref={ref} className={className} style={{ aspectRatio: '570 / 730' }} aria-label={`${card.name}, ${card.overall}`} />
}
