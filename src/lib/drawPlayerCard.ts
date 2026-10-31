import { CARD_STATS, type CardTier, type PlayerCardData } from './playerCard'

// Draws a player card on a canvas, in our own design (no art from other games): a notched shield, a tier colour, soft rings, the portrait,
// the rating on the left and the six values at the bottom. Everything is drawn here so the picture can be saved as a PNG.

export const CARD_W = 570
export const CARD_H = 730
const SCALE = 2 // the canvas has twice the pixels, so the PNG is sharp

interface Palette {
  top: string
  bottom: string
  ring: string
  glow: string
  text: string
  sub: string
  border1: string
  border2: string
  label: string
}

const PALETTE: Record<CardTier, Palette> = {
  bronze: { top: '#d79a64', bottom: '#7a4a28', ring: '#f3c79a', glow: '#ffd9b0', text: '#2b1a0c', sub: '#4a2f17', border1: '#f6d3ac', border2: '#8a5a33', label: 'BRONZE' },
  silver: { top: '#eef2f8', bottom: '#8f9bad', ring: '#ffffff', glow: '#ffffff', text: '#1d2736', sub: '#3a475a', border1: '#ffffff', border2: '#8793a6', label: 'SILVER' },
  gold: { top: '#f8df8e', bottom: '#b88a2c', ring: '#fff3c4', glow: '#fff1b8', text: '#3a2a08', sub: '#5c4311', border1: '#fff0b0', border2: '#a67a22', label: 'GOLD' },
  diamond: { top: '#c9efff', bottom: '#3b82c4', ring: '#e8f9ff', glow: '#bfeaff', text: '#08294a', sub: '#134575', border1: '#e4f7ff', border2: '#3a7cb8', label: 'DIAMOND' },
  legend: { top: '#6b3fd1', bottom: '#1d0f45', ring: '#c9a8ff', glow: '#a78bfa', text: '#ffe9a6', sub: '#e6cf86', border1: '#ffe9a6', border2: '#8a6bd6', label: 'LEGEND' },
}

export interface CardAssets {
  avatar?: HTMLImageElement | null
  /** the avatar placement: x, y in percent (how much of the overflow is cut off left / top) and zoom, like on the profile page */
  fit?: { x: number; y: number; zoom: number } | null
  flag?: HTMLImageElement | null
  crest?: HTMLImageElement | null
}

/** The outline of the card: notched top corners with a small peak in the middle, cut bottom corners. */
function outline(ctx: CanvasRenderingContext2D, grow = 0) {
  const g = grow
  const pts: [number, number][] = [
    [28 - g, 74],
    [74, 28 - g],
    [232, 28 - g],
    [285, 6 - g],
    [338, 28 - g],
    [496, 28 - g],
    [542 + g, 74],
    [542 + g, 636],
    [506 + g, 686 + g],
    [285, 724 + g],
    [64 - g, 686 + g],
    [28 - g, 636],
  ]
  ctx.beginPath()
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)))
  ctx.closePath()
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, startSize: number, weight: number, family: string) {
  let size = startSize
  do {
    ctx.font = `${weight} ${size}px ${family}`
    size -= 2
  } while (ctx.measureText(text).width > maxWidth && size > 16)
}

/** Draws a picture so that it covers the box, placed like the profile pictures (x, y, zoom). */
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, bx: number, by: number, bw: number, bh: number, fit: CardAssets['fit']) {
  const zoom = fit?.zoom ?? 1
  const s = Math.max(bw / img.naturalWidth, bh / img.naturalHeight) * zoom
  const w = img.naturalWidth * s
  const h = img.naturalHeight * s
  const fx = (fit?.x ?? 50) / 100
  const fy = (fit?.y ?? 50) / 100
  ctx.drawImage(img, bx - (w - bw) * fx, by - (h - bh) * fy, w, h)
}

export function drawPlayerCard(canvas: HTMLCanvasElement, card: PlayerCardData, assets: CardAssets) {
  canvas.width = CARD_W * SCALE
  canvas.height = CARD_H * SCALE
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0)
  ctx.clearRect(0, 0, CARD_W, CARD_H)
  const p = PALETTE[card.tier]
  const display = '"Cinzel", "Rajdhani", "Inter", system-ui, serif'
  const body = '"Inter", system-ui, sans-serif'

  // ── the body of the card ──
  ctx.save()
  outline(ctx)
  ctx.clip()
  const bg = ctx.createLinearGradient(0, 0, 0, CARD_H)
  bg.addColorStop(0, p.top)
  bg.addColorStop(1, p.bottom)
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, CARD_W, CARD_H)
  // a glow behind the portrait
  const glow = ctx.createRadialGradient(300, 230, 10, 300, 230, 330)
  glow.addColorStop(0, p.glow + 'cc')
  glow.addColorStop(0.55, p.glow + '33')
  glow.addColorStop(1, p.glow + '00')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, CARD_W, CARD_H)
  // rings
  ctx.lineCap = 'round'
  for (let i = 0; i < 7; i++) {
    ctx.beginPath()
    ctx.ellipse(370, 235, 110 + i * 34, 70 + i * 27, -0.55, 0, Math.PI * 2)
    ctx.strokeStyle = p.ring + (i % 2 ? '30' : '55')
    ctx.lineWidth = 16 - i * 1.6
    ctx.stroke()
  }
  // a light band across the card
  const band = ctx.createLinearGradient(0, 120, CARD_W, 520)
  band.addColorStop(0, '#ffffff00')
  band.addColorStop(0.45, '#ffffff22')
  band.addColorStop(0.55, '#ffffff00')
  ctx.fillStyle = band
  ctx.fillRect(0, 0, CARD_W, CARD_H)
  // the clan tag, tiled and faint
  ctx.save()
  ctx.rotate(-0.32)
  ctx.font = `700 30px ${display}`
  ctx.fillStyle = p.ring + '14'
  for (let y = 40; y < 1000; y += 92) for (let x = -300; x < 800; x += 150) ctx.fillText('CYN', x + ((y / 92) % 2) * 75, y)
  ctx.restore()
  ctx.restore()

  // ── the portrait (soft at the bottom) ──
  const pw = 330
  const ph = 400
  const px = 285 - pw / 2
  const py = 78
  const off = document.createElement('canvas')
  off.width = pw * SCALE
  off.height = ph * SCALE
  const o = off.getContext('2d')
  if (o) {
    o.setTransform(SCALE, 0, 0, SCALE, 0, 0)
    if (assets.avatar && assets.avatar.naturalWidth > 0) {
      drawCover(o, assets.avatar, 0, 0, pw, ph, assets.fit)
    } else {
      // no picture: a dark silhouette
      const sil = o.createLinearGradient(0, 40, 0, ph)
      sil.addColorStop(0, '#0b0b12')
      sil.addColorStop(1, '#1b1b2a')
      o.fillStyle = sil
      o.beginPath()
      o.arc(pw / 2, 150, 70, 0, Math.PI * 2)
      o.fill()
      o.fillRect(pw / 2 - 30, 190, 60, 60) // the neck
      o.beginPath()
      o.moveTo(pw / 2 - 150, ph)
      o.quadraticCurveTo(pw / 2 - 150, 250, pw / 2 - 40, 232)
      o.lineTo(pw / 2 + 40, 232)
      o.quadraticCurveTo(pw / 2 + 150, 250, pw / 2 + 150, ph)
      o.closePath()
      o.fill()
    }
    // fade out at the bottom and at the sides
    o.globalCompositeOperation = 'destination-in'
    const fade = o.createLinearGradient(0, 0, 0, ph)
    fade.addColorStop(0, '#000000')
    fade.addColorStop(0.62, '#000000')
    fade.addColorStop(1, '#00000000')
    o.fillStyle = fade
    o.fillRect(0, 0, pw, ph)
    const side = o.createLinearGradient(0, 0, pw, 0)
    side.addColorStop(0, '#00000000')
    side.addColorStop(0.1, '#000000')
    side.addColorStop(0.9, '#000000')
    side.addColorStop(1, '#00000000')
    o.fillStyle = side
    o.fillRect(0, 0, pw, ph)
    ctx.save()
    outline(ctx)
    ctx.clip()
    ctx.drawImage(off, px, py, pw, ph)
    ctx.restore()
  }

  // ── tier word, slanted at the right ──
  ctx.save()
  ctx.translate(448, 392)
  ctx.rotate(-0.55)
  ctx.font = `800 40px ${display}`
  ctx.textAlign = 'center'
  ctx.lineWidth = 3
  ctx.strokeStyle = p.border2 + 'aa'
  ctx.strokeText(p.label, 0, 0)
  ctx.fillStyle = p.border1 + 'dd'
  ctx.fillText(p.label, 0, 0)
  ctx.restore()

  // ── crest at the top ──
  if (assets.crest && assets.crest.naturalWidth > 0) ctx.drawImage(assets.crest, 285 - 36, 38, 72, 72)

  // ── rating, title, flag on the left ──
  ctx.textAlign = 'center'
  ctx.fillStyle = p.text
  ctx.font = `800 92px ${display}`
  ctx.fillText(String(card.overall), 98, 168)
  fitText(ctx, card.title, 120, 26, 800, body)
  ctx.fillText(card.title, 98, 204)
  ctx.fillStyle = p.text + '55'
  ctx.fillRect(48, 220, 100, 3)
  if (assets.flag && assets.flag.naturalWidth > 0) {
    ctx.save()
    ctx.shadowColor = '#00000055'
    ctx.shadowBlur = 6
    ctx.drawImage(assets.flag, 98 - 26, 238, 52, 52)
    ctx.restore()
  }

  // ── name ──
  ctx.fillStyle = p.text
  fitText(ctx, card.name, 400, 50, 800, display)
  ctx.fillText(card.name, 285, 520)
  ctx.fillStyle = p.text + '66'
  ctx.fillRect(90, 540, 390, 3)

  // ── the six values ──
  CARD_STATS.forEach((stat, i) => {
    const cx = 85 + i * 80
    ctx.fillStyle = p.sub
    ctx.font = `800 21px ${body}`
    ctx.fillText(stat, cx, 582)
    ctx.fillStyle = p.text
    ctx.font = `800 46px ${display}`
    ctx.fillText(String(card.stats[stat]), cx, 636)
  })

  // ── footer ──
  ctx.fillStyle = p.sub
  ctx.font = `700 12px ${body}`
  ctx.fillText(`✓ ID ${card.publicId}  ·  CYNCLAN.COM`, 285, 678)

  // ── borders ──
  ctx.save()
  outline(ctx)
  const edge = ctx.createLinearGradient(0, 0, CARD_W, CARD_H)
  edge.addColorStop(0, p.border1)
  edge.addColorStop(0.5, p.border2)
  edge.addColorStop(1, p.border1)
  ctx.strokeStyle = edge
  ctx.lineWidth = 7
  ctx.lineJoin = 'round'
  ctx.stroke()
  ctx.restore()
  ctx.save()
  ctx.translate(285, 365)
  ctx.scale(0.955, 0.965)
  ctx.translate(-285, -365)
  outline(ctx)
  ctx.strokeStyle = p.border1 + '88'
  ctx.lineWidth = 2
  ctx.lineJoin = 'round'
  ctx.stroke()
  ctx.restore()
}
