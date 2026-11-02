import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { CurrencyIcon } from '../components/CurrencyIcon'
import { SectionHeading, Spinner } from '../components/ui'
import { useLanguage } from '../i18n/LanguageContext'

// The skin shop: the patterns (skins), flags and crowns of OpenFront's store, by default only the items of the CYN store (affiliate code "cyn"), all on
// one page. The data is OpenFront's public cosmetics file, read by the Worker (worker/cosmetics.js). A pattern is drawn here from its encoded tiles (the
// format the game uses: a header with size and scale, then one bit per tile). Members upvote their favourites (worker/skinVotes.js) and can look at an
// item "in game" (a small map with a territory, the player's name, flag and crown).

interface Palette {
  name: string
  primary: string
  secondary: string
}
interface Item {
  id: string
  name: string
  rarity: string | null
  artist: string | null
  price: number | null
  cyn: boolean
  paid: boolean
  /** a prize of a clan event: shown in the shop, but it cannot be bought */
  event?: boolean
  /** the CYN bot saw it in the store for the first time within the last 14 days */
  isNew?: boolean
}
interface PatternItem extends Item {
  pattern: string
  palettes: Palette[]
}
interface ImageItem extends Item {
  url: string
}
interface Cosmetics {
  scope: 'cyn' | 'all'
  patterns: PatternItem[]
  flags: ImageItem[]
  crowns: ImageItem[]
  storeUrl: string
}
type Kind = 'pattern' | 'flag' | 'crown'
const voteKey = (kind: Kind, id: string) => `${kind}:${id}`
// in OpenFront's file but not in the store
const HIDDEN = new Set(['cyn_2'])

const RARITY: Record<string, string> = {
  common: 'border-slate-500/60 text-slate-300',
  uncommon: 'border-emerald-500/60 text-emerald-300',
  rare: 'border-sky-500/60 text-sky-300',
  epic: 'border-purple-500/60 text-purple-300',
  legendary: 'border-amber-500/70 text-amber-300',
}

interface Decoded {
  width: number
  height: number
  scale: number
  bytes: Uint8Array
}
/** The pattern as pixels: the game's format is base64url, byte 0 = version, byte 1/2 = scale and size, then one bit per tile (0 = primary colour). */
function decodePattern(b64: string): Decoded | null {
  try {
    const bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/'))
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
    if (bytes.length < 3 || bytes[0] !== 0) return null
    const scale = bytes[1] & 0x07
    const width = (((bytes[2] & 0x03) << 5) | ((bytes[1] >> 3) & 0x1f)) + 2
    const height = ((bytes[2] >> 2) & 0x3f) + 2
    if (bytes.length - 3 < (width * height + 7) >> 3) return null
    return { width, height, scale, bytes }
  } catch {
    return null
  }
}

// the colours OpenFront offers to try a skin with in a team game (a team colour replaces the upper colour of the skin)
const TEAM_COLORS = ['#ef4444', '#3b82f6', '#06b6d4', '#8b5cf6', '#eab308', '#f97316', '#22c55e']

const hexRgb = (c: string) => [parseInt(c.slice(1, 3), 16) || 0, parseInt(c.slice(3, 5), 16) || 0, parseInt(c.slice(5, 7), 16) || 0]

/** One full repeat of the pattern (game tiles, one pixel each) in the two colours, as a canvas. */
function patternTile(p: Decoded, palette: Palette | undefined): HTMLCanvasElement {
  const w = p.width << p.scale
  const h = p.height << p.scale
  const tile = document.createElement('canvas')
  tile.width = w
  tile.height = h
  const ctx = tile.getContext('2d')!
  const img = ctx.createImageData(w, h)
  const a = hexRgb(palette?.primary ?? '#ffffff')
  const b = hexRgb(palette?.secondary ?? '#334155')
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y >> p.scale) * p.width + (x >> p.scale)
      const primary = (p.bytes[3 + (idx >> 3)] & (1 << (idx & 7))) === 0
      const c = primary ? a : b
      const o = (y * w + x) * 4
      img.data[o] = c[0]
      img.data[o + 1] = c[1]
      img.data[o + 2] = c[2]
      img.data[o + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return tile
}

/** The pattern zoomed out: at least two full repeats side by side, so the whole motif can be seen. */
function PatternSwatch({ pattern, palette, team = null, size = 176 }: { pattern: string; palette: Palette | undefined; team?: number | null; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    const p = decodePattern(pattern)
    if (!canvas || !p) return
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const tile = patternTile(p, team != null ? { name: 'team', primary: TEAM_COLORS[team], secondary: palette?.secondary ?? '#000000' } : palette)
    // as many pixels per game tile as fit two repeats into the picture (at least a fraction of one, never more than 6)
    const px = Math.min(6, size / (2 * Math.max(tile.width, tile.height)))
    ctx.imageSmoothingEnabled = false
    ctx.fillStyle = '#0b0f1c'
    ctx.fillRect(0, 0, size, size)
    const w = tile.width * px
    const h = tile.height * px
    for (let y = 0; y < size; y += h) for (let x = 0; x < size; x += w) ctx.drawImage(tile, x, y, w, h)
  }, [pattern, palette, team, size])
  return <canvas ref={ref} style={{ width: size, height: size }} className="max-w-full rounded-lg [image-rendering:pixelated]" aria-hidden />
}

function Price({ item, de }: { item: Item; de: boolean }) {
  if (item.price != null)
    return (
      <span className="inline-flex items-center gap-1 font-display text-sm font-bold text-gold-light">
        {item.price.toLocaleString(de ? 'de-DE' : 'en-GB')} <CurrencyIcon currency="hard" className="h-4 w-4" />
      </span>
    )
  if (item.event) return <span className="text-xs font-semibold text-gold-light">{de ? 'Event-Preis (nicht kaufbar)' : 'Event prize (not for sale)'}</span>
  return <span className="text-xs text-slate-400">{item.paid ? (de ? 'Bezahlt im Store' : 'Paid in the store') : ''}</span>
}

const EyeIcon = ({ className = 'h-5 w-5' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)
const HeartIcon = ({ filled, className = 'h-5 w-5' }: { filled: boolean; className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 21s-6.7-4.35-9.3-8.1C.9 10.2 1.4 6.6 4.3 5 6.4 3.8 9 4.3 12 7c3-2.7 5.6-3.2 7.7-2 2.9 1.6 3.4 5.2 1.6 7.9C18.7 16.65 12 21 12 21Z" />
  </svg>
)

function ItemCard({ item, kind, preview, votes, onVote, onView, onHover, de, children }: { item: Item; kind: Kind; preview: ReactNode; votes: { count: number; mine: boolean }; onVote: () => void; onView?: () => void; onHover?: (on: boolean) => void; de: boolean; children?: ReactNode }) {
  return (
    <div onMouseEnter={onHover ? () => onHover(true) : undefined} onMouseLeave={onHover ? () => onHover(false) : undefined} className={`flex flex-col items-center gap-2 rounded-xl border bg-base-900/70 p-3 text-center ${RARITY[item.rarity ?? 'common'] ?? RARITY.common}`}>
      <div className="relative flex min-h-[11rem] w-full items-center justify-center overflow-hidden">
        {preview}
        {/* like in OpenFront: the eye opens the in-game view, the heart is the upvote, both on the picture */}
        {onView && (
          <button
            type="button"
            onClick={onView}
            title={de ? 'Im Spiel ansehen' : 'In-game view'}
            aria-label={de ? 'Im Spiel ansehen' : 'In-game view'}
            className="absolute left-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-base-950/80 text-slate-200 transition-colors hover:bg-accent hover:text-white"
          >
            <EyeIcon className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={onVote}
          aria-pressed={votes.mine}
          title={de ? 'Lieblings-Skin: Upvote' : 'Favourite: upvote'}
          className={`absolute right-1.5 top-1.5 flex h-8 items-center gap-1 rounded-full bg-base-950/80 px-2 text-xs font-semibold transition-colors ${votes.mine ? 'text-rose-400' : 'text-slate-200 hover:text-rose-300'}`}
        >
          <HeartIcon filled={votes.mine} className="h-4 w-4" />
          {votes.count}
        </button>
        {item.isNew && <span className="absolute bottom-1.5 left-1.5 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">{de ? 'Neu' : 'New'}</span>}
      </div>
      {children}
      <p className="w-full truncate text-sm font-semibold text-white" title={item.name}>
        {item.name.replace(/_/g, ' ')}
      </p>
      <p className="text-[11px] uppercase tracking-wide">
        {item.rarity ?? ''} · {kind === 'pattern' ? 'Skin' : kind === 'flag' ? (de ? 'Flagge' : 'Flag') : de ? 'Krone' : 'Crown'}
      </p>
      <Price item={item} de={de} />
      {item.artist && (
        <p className="text-[11px] text-slate-500">
          {de ? 'von' : 'by'} {item.artist}
        </p>
      )}
    </div>
  )
}

interface View {
  kind: Kind
  id: string
  palette: number
  /** index into TEAM_COLORS (the team colour replaces the skin's own colours), null = the skin's own colours */
  team: number | null
}

// The terrain of the preview: OpenFront's Australia map (500 x 375 tiles, one byte each: bit 7 land, bit 6 shore, bits 0-4 height or distance from the
// coast), coloured like the game's light theme. The file is public/maps/australia-16x.bin (from the OpenFront repository, resources/maps/australia).
const MAP_W = 500
const MAP_H = 375
let mapTerrain: Promise<{ terrain: HTMLCanvasElement; land: HTMLCanvasElement }> | null = null
function loadMap() {
  mapTerrain ??= fetch('/maps/australia-16x.bin')
    .then((r) => r.arrayBuffer())
    .then((buf) => {
      const bytes = new Uint8Array(buf)
      const terrain = document.createElement('canvas')
      const land = document.createElement('canvas')
      terrain.width = land.width = MAP_W
      terrain.height = land.height = MAP_H
      const tctx = terrain.getContext('2d')!
      const lctx = land.getContext('2d')!
      const timg = tctx.createImageData(MAP_W, MAP_H)
      const limg = lctx.createImageData(MAP_W, MAP_H)
      for (let i = 0; i < MAP_W * MAP_H; i++) {
        const b = bytes[i]
        const isLand = (b & 128) !== 0
        const shore = (b & 64) !== 0
        const mag = b & 31
        let r: number, g: number, bl: number
        if (isLand) {
          if (shore) [r, g, bl] = [204, 203, 158]
          else if (mag < 10) [r, g, bl] = [190, 220 - 2 * mag, 138]
          else if (mag < 20) [r, g, bl] = [200 + 2 * (mag - 10), 183 + 2 * (mag - 10), 138 + 2 * (mag - 10)]
          else [r, g, bl] = [230 + (mag - 20) / 2, 230 + (mag - 20) / 2, 230 + (mag - 20) / 2]
        } else if (shore) [r, g, bl] = [100, 160, 205]
        else {
          const d = Math.min(mag, 10) * 2
          ;[r, g, bl] = [70 - d, 132 - d, 180 - d]
        }
        timg.data.set([r, g, bl, 255], i * 4)
        limg.data.set([255, 255, 255, isLand ? 255 : 0], i * 4)
      }
      tctx.putImageData(timg, 0, 0)
      lctx.putImageData(limg, 0, 0)
      return { terrain, land }
    })
  return mapTerrain
}

const loadImage = (src: string | undefined) =>
  new Promise<HTMLImageElement | null>((resolve) => {
    if (!src) return resolve(null)
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })

const titleCase = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

/** "In game" like OpenFront's store preview: the Australia map with the skin over all the land (or a team territory with name, flag and crown), zoom, skin and team colours. */
function GameView({ data, start, onClose, de }: { data: Cosmetics; start: View; onClose: () => void; de: boolean }) {
  const [view, setView] = useState<View>(start)
  const [zoom, setZoom] = useState(1)
  // the middle of the view, in game tiles (the map is 2000 x 1500); dragged with the left mouse button
  const [centre, setCentre] = useState({ x: 1000, y: 750 })
  const ref = useRef<HTMLCanvasElement>(null)
  const drag = useRef<{ x: number; y: number } | null>(null)
  const tiles = useRef(new Map<string, HTMLCanvasElement>())
  const item: Item | undefined = (view.kind === 'pattern' ? data.patterns : view.kind === 'flag' ? data.flags : data.crowns).find((x) => x.id === view.id)
  const pattern = view.kind === 'pattern' ? (item as PatternItem | undefined) : undefined
  const imageUrl = view.kind !== 'pattern' ? (item as ImageItem | undefined)?.url : undefined

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    let alive = true
    const W = 816
    const H = 500
    canvas.width = W
    canvas.height = H
    void (async () => {
      const [{ terrain, land }, img] = await Promise.all([loadMap(), loadImage(imageUrl)])
      if (!alive) return
      const ctx = canvas.getContext('2d')!
      // the part of the map in view: the whole width of Australia at zoom 1 (the map has 2000 x 1500 game tiles)
      const s = (W / 1500) * zoom // canvas pixels per game tile
      const viewW = W / s
      const viewH = H / s
      const vx = Math.min(Math.max(centre.x - viewW / 2, 0), 2000 - viewW)
      const vy = Math.min(Math.max(centre.y - viewH / 2, 0), 1500 - viewH)
      const mapRect = { x: -vx * s, y: -vy * s, w: 2000 * s, h: 1500 * s }
      ctx.clearRect(0, 0, W, H)
      ctx.imageSmoothingEnabled = true
      ctx.fillStyle = '#4684b4'
      ctx.fillRect(0, 0, W, H)
      ctx.drawImage(terrain, mapRect.x, mapRect.y, mapRect.w, mapRect.h)

      // the territory colours: the skin's palette; a team colour always replaces the upper (primary) colour only, the second colour stays the skin's
      const palette = pattern ? pattern.palettes[view.palette] : undefined
      const primary = view.team != null ? TEAM_COLORS[view.team] : (palette?.primary ?? '#ffffff')
      const secondary = palette?.secondary ?? '#000000'
      const over = document.createElement('canvas')
      over.width = W
      over.height = H
      const octx = over.getContext('2d')!
      const decoded = pattern ? decodePattern(pattern.pattern) : null
      if (decoded) {
        // the coloured tile and its zoomed copy are kept, so dragging only has to paint
        const tileKey = `${pattern?.id}|${primary}|${secondary}`
        let tile = tiles.current.get(tileKey)
        if (!tile) {
          tile = patternTile(decoded, { name: 'x', primary, secondary })
          tiles.current.set(tileKey, tile)
        }
        const scaledKey = `${tileKey}|${s.toFixed(3)}`
        let scaled = tiles.current.get(scaledKey)
        if (!scaled) {
          scaled = document.createElement('canvas')
          scaled.width = Math.max(1, Math.round(tile.width * s))
          scaled.height = Math.max(1, Math.round(tile.height * s))
          const sctx = scaled.getContext('2d')!
          sctx.imageSmoothingEnabled = false
          sctx.drawImage(tile, 0, 0, scaled.width, scaled.height)
          tiles.current.set(scaledKey, scaled)
        }
        const pat = octx.createPattern(scaled, 'repeat')
        if (pat) {
          pat.setTransform(new DOMMatrix().translate(mapRect.x % scaled.width, mapRect.y % scaled.height))
          octx.fillStyle = pat
          octx.fillRect(0, 0, W, H)
        }
      } else {
        // flags and crowns: a team territory around the middle of the map
        octx.fillStyle = primary
        octx.beginPath()
        octx.ellipse(mapRect.x + 1000 * s, mapRect.y + 760 * s, 330 * s, 240 * s, 0, 0, Math.PI * 2)
        octx.fill()
      }
      octx.globalCompositeOperation = 'destination-in'
      octx.drawImage(land, mapRect.x, mapRect.y, mapRect.w, mapRect.h)
      ctx.globalAlpha = 0.62
      ctx.drawImage(over, 0, 0)
      ctx.globalAlpha = 1

      if (!decoded) {
        // the player's name with the flag in front and the crown above, like in the game
        const k = Math.min(zoom, 1.6)
        const cx = mapRect.x + 1000 * s
        const cy = mapRect.y + 760 * s
        const name = 'Zilka'
        ctx.font = `700 ${Math.round(34 * k)}px Inter, system-ui, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        const tw = ctx.measureText(name).width
        const fl = view.kind === 'flag' ? img : null
        const flagW = fl ? 46 * k : 0
        const left = cx - (tw + (flagW ? flagW + 10 : 0)) / 2
        if (fl) ctx.drawImage(fl, left, cy - (flagW * fl.naturalHeight) / fl.naturalWidth / 2, flagW, (flagW * fl.naturalHeight) / fl.naturalWidth)
        const tx = left + (flagW ? flagW + 10 : 0) + tw / 2
        ctx.lineWidth = 6
        ctx.strokeStyle = 'rgba(0,0,0,0.85)'
        ctx.fillStyle = '#ffffff'
        ctx.strokeText(name, tx, cy)
        ctx.fillText(name, tx, cy)
        if (view.kind === 'crown' && img) {
          const cw = 72 * k
          const ch = (cw * img.naturalHeight) / img.naturalWidth
          ctx.drawImage(img, cx - cw / 2, cy - 26 * k - ch, cw, ch)
        }
      }
    })()
    return () => {
      alive = false
    }
  }, [pattern, imageUrl, view.palette, view.team, view.kind, zoom, centre])

  // dragging with the left mouse button moves the view, the wheel zooms
  const limit = (c: { x: number; y: number }, z: number) => {
    const viewW = 1500 / z
    const viewH = (500 / 816) * 1500 / z
    return { x: Math.min(Math.max(c.x, viewW / 2), 2000 - viewW / 2), y: Math.min(Math.max(c.y, viewH / 2), 1500 - viewH / 2) }
  }
  const zoomTo = (z: number) => {
    const next = Math.min(3, Math.max(1, +z.toFixed(2)))
    setZoom(next)
    setCentre((c) => limit(c, next))
  }
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      zoomTo(zoom + (e.deltaY < 0 ? 0.25 : -0.25))
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom])

  const palettes = pattern?.palettes ?? []
  const swatch = (a: string, b: string) => ({ background: `linear-gradient(135deg, ${a} 50%, ${b} 50%)` })
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto bg-black/85 p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label={de ? 'Im Spiel ansehen' : 'In-game view'}>
      <div className="w-full max-w-4xl overflow-hidden rounded-2xl border border-white/10 bg-[#171717] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2 className="font-display text-xl font-bold text-white">{titleCase(item?.name ?? view.id)}</h2>
            {item?.rarity && <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${RARITY[item.rarity] ?? RARITY.common}`}>{item.rarity}</span>}
            {item?.artist && (
              <span className="text-xs text-slate-400">
                {de ? 'Künstler' : 'Artist'}: <b className="text-slate-200">{item.artist}</b>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex overflow-hidden rounded-lg border border-white/10">
              <button type="button" onClick={() => zoomTo(zoom - 0.5)} className="px-3 py-1.5 text-slate-300 hover:bg-white/10" aria-label="−">
                −
              </button>
              <button type="button" onClick={() => zoomTo(zoom + 0.5)} className="px-3 py-1.5 text-slate-300 hover:bg-white/10" aria-label="+">
                +
              </button>
            </div>
            <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-slate-200 hover:bg-white/20" aria-label={de ? 'Schließen' : 'Close'}>
              ✕
            </button>
          </div>
        </div>
        <div className="p-4">
          <canvas
            ref={ref}
            className="w-full cursor-grab touch-none rounded-xl active:cursor-grabbing"
            style={{ aspectRatio: '816 / 500' }}
            onPointerDown={(e) => {
              if (e.button !== 0) return
              e.currentTarget.setPointerCapture(e.pointerId)
              drag.current = { x: e.clientX, y: e.clientY }
            }}
            onPointerMove={(e) => {
              const d = drag.current
              if (!d) return
              const k = 816 / e.currentTarget.clientWidth // screen pixels to canvas pixels
              const s = (816 / 1500) * zoom // canvas pixels per game tile
              const dx = ((e.clientX - d.x) * k) / s
              const dy = ((e.clientY - d.y) * k) / s
              drag.current = { x: e.clientX, y: e.clientY }
              setCentre((c) => limit({ x: c.x - dx, y: c.y - dy }, zoom))
            }}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3 border-t border-white/10 px-5 py-3 text-sm text-slate-200">
          {pattern && (
            <div className="flex items-center gap-3">
              <span className="font-semibold">{de ? 'Skin-Farben' : 'Skin colors'}</span>
              {palettes.map((p, n) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => setView({ ...view, palette: n, team: null })}
                  title={p.name.replace(/_/g, ' ')}
                  aria-label={p.name}
                  className={`h-8 w-8 rounded-full border-2 ${view.team == null && n === view.palette ? 'border-cyan-400 ring-2 ring-cyan-400/50' : 'border-white/20'}`}
                  style={swatch(p.primary, p.secondary)}
                />
              ))}
            </div>
          )}
          <div className="flex items-center gap-3">
            <span className="font-semibold">{de ? 'Team-Farben' : 'Team colors'}</span>
            {TEAM_COLORS.map((c, n) => (
              <button
                key={c}
                type="button"
                onClick={() => setView({ ...view, team: view.team === n ? null : n })}
                aria-label={c}
                className={`h-8 w-8 rounded-full border-2 ${view.team === n ? 'border-cyan-400 ring-2 ring-cyan-400/50' : 'border-white/20'}`}
                style={swatch(c, palettes[view.palette]?.secondary ?? '#000000')}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Skin shop: patterns, flags and crowns of OpenFront's store (those of the CYN store by default), all on one page. */
export default function Shop() {
  const { language } = useLanguage()
  const de = language === 'de'
  const [scope, setScope] = useState<'cyn' | 'all'>('cyn')
  const [data, setData] = useState<Cosmetics | null>(null)
  const [error, setError] = useState(false)
  const [shown, setShown] = useState<Record<Kind, number>>({ pattern: 36, flag: 36, crown: 36 })
  const [palette, setPalette] = useState<Record<string, number>>({})
  const [votes, setVotes] = useState<{ counts: Record<string, number>; mine: Set<string>; signedIn: boolean }>({ counts: {}, mine: new Set(), signedIn: false })
  const [note, setNote] = useState<string | null>(null)
  const [viewing, setViewing] = useState<View | null>(null)
  // while the mouse is over a skin its picture shows the team colours one after the other, like a slideshow
  const [hovered, setHovered] = useState<string | null>(null)
  const [slide, setSlide] = useState(0)
  useEffect(() => {
    setSlide(0)
    if (!hovered) return
    const timer = window.setInterval(() => setSlide((n) => (n + 1) % (TEAM_COLORS.length + 1)), 700)
    return () => window.clearInterval(timer)
  }, [hovered])

  useEffect(() => {
    let alive = true
    setData(null)
    setError(false)
    setShown({ pattern: 36, flag: 36, crown: 36 })
    fetch(`/api/cosmetics?scope=${scope}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: Cosmetics) => {
        if (!alive) return
        // cheapest first, then alphabetical; what has no price in plutonium comes last
        const clean = <T extends Item>(list: T[]) =>
          list
            .filter((i) => !HIDDEN.has(i.id))
            .sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
        setData({ ...j, patterns: clean(j.patterns), flags: clean(j.flags), crowns: clean(j.crowns) })
      })
      .catch(() => alive && setError(true))
    return () => {
      alive = false
    }
  }, [scope])

  const loadVotes = useCallback(() => {
    fetch('/api/skin-votes', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { counts: Record<string, number>; mine: string[]; signedIn: boolean } | null) => j && setVotes({ counts: j.counts, mine: new Set(j.mine), signedIn: j.signedIn }))
      .catch(() => {})
  }, [])
  useEffect(loadVotes, [loadVotes])

  async function vote(kind: Kind, id: string) {
    if (!votes.signedIn) {
      setNote(de ? 'Zum Abstimmen musst du als Mitglied angemeldet sein.' : 'You have to be signed in as a member to vote.')
      return
    }
    setNote(null)
    const key = voteKey(kind, id)
    const on = !votes.mine.has(key)
    // shown at once, taken back when the server says no
    setVotes((v) => {
      const mine = new Set(v.mine)
      if (on) mine.add(key)
      else mine.delete(key)
      return { ...v, mine, counts: { ...v.counts, [key]: Math.max(0, (v.counts[key] ?? 0) + (on ? 1 : -1)) } }
    })
    try {
      const res = await fetch('/api/skin-votes', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, on }) })
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null
        setNote(j?.error === 'too_many' ? (de ? 'Du kannst höchstens 40 Skins upvoten.' : 'You can upvote at most 40 items.') : de ? 'Das hat nicht geklappt.' : 'That did not work.')
        loadVotes()
      }
    } catch {
      loadVotes()
    }
  }

  const storeUrl = data?.storeUrl ?? 'https://openfront.io/#modal=store&affiliateCode=cyn'
  const vk = (kind: Kind, id: string) => ({ count: votes.counts[voteKey(kind, id)] ?? 0, mine: votes.mine.has(voteKey(kind, id)) })
  const sections: { kind: Kind; title: string; count: number }[] = data
    ? [
        { kind: 'pattern', title: de ? 'Skins (Muster)' : 'Skins (patterns)', count: data.patterns.length },
        { kind: 'flag', title: de ? 'Flaggen' : 'Flags', count: data.flags.length },
        { kind: 'crown', title: de ? 'Kronen' : 'Crowns', count: data.crowns.length },
      ]
    : []
  const more = (kind: Kind) => setShown((s) => ({ ...s, [kind]: s[kind] + 36 }))

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <SectionHeading center eyebrow={de ? 'OpenFront Store' : 'OpenFront store'} title="Skin Shop" />
      <div className="flex flex-col items-center gap-3 text-center">
        <p className="max-w-2xl text-sm text-slate-400">
          {de
            ? 'Alle Skin-Muster, Flaggen und Kronen des CYN-Stores auf einen Blick. Stimm mit dem Herz für deine Lieblinge ab und sieh dir mit dem Auge an, wie sie im Spiel aussehen. Kaufen kannst du sie direkt im Store von OpenFront.'
            : 'All skin patterns, flags and crowns of the CYN store at a glance. Upvote your favourites with the heart and see how they look in game with the eye. You buy them in OpenFront’s own store.'}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <a href={storeUrl} target="_blank" rel="noopener noreferrer" className="btn-gold">
            {de ? 'Zum Store' : 'Open the store'} ↗
          </a>
        </div>
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-400">
          <input type="checkbox" checked={scope === 'all'} onChange={(e) => setScope(e.target.checked ? 'all' : 'cyn')} className="accent-[#8b5cf6]" />
          {de ? 'Alle Items von OpenFront zeigen' : 'Show all OpenFront items'}
        </label>
        {note && <p className="text-sm text-gold-light">{note}</p>}
      </div>

      {error && <p className="text-center text-sm text-slate-400">{de ? 'Der Shop lässt sich gerade nicht laden.' : 'The shop cannot be loaded right now.'}</p>}
      {!data && !error && <Spinner />}

      {data &&
        sections.map(({ kind, title, count }) => (
          <section key={kind} className="space-y-4">
            <h2 className="flex items-baseline gap-2 font-display text-2xl font-bold text-white">
              {title} <span className="text-sm font-normal text-slate-500">{count}</span>
            </h2>
            {count === 0 && <p className="text-sm text-slate-400">{de ? 'Hier gibt es noch nichts.' : 'Nothing here yet.'}</p>}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {kind === 'pattern' &&
                data.patterns.slice(0, shown.pattern).map((it) => {
                  const at = palette[it.id] ?? 0
                  return (
                    <ItemCard
                      key={it.id}
                      item={it}
                      kind="pattern"
                      de={de}
                      votes={vk('pattern', it.id)}
                      onVote={() => void vote('pattern', it.id)}
                      onView={() => setViewing({ kind: 'pattern', id: it.id, palette: at, team: null })}
                      onHover={(on) => setHovered(on ? it.id : (h) => (h === it.id ? null : h))}
                      preview={<PatternSwatch pattern={it.pattern} palette={it.palettes[at]} team={hovered === it.id && slide > 0 ? slide - 1 : null} />}
                    >
                      {it.palettes.length > 1 && (
                        <div className="flex gap-1">
                          {it.palettes.map((p, n) => (
                            <button
                              key={p.name}
                              type="button"
                              onClick={() => setPalette((s) => ({ ...s, [it.id]: n }))}
                              title={p.name.replace(/_/g, ' ')}
                              aria-label={p.name}
                              className={`h-3.5 w-3.5 rounded-full border ${n === at ? 'border-white' : 'border-base-600'}`}
                              style={{ background: `linear-gradient(135deg, ${p.primary} 50%, ${p.secondary} 50%)` }}
                            />
                          ))}
                        </div>
                      )}
                    </ItemCard>
                  )
                })}
              {kind !== 'pattern' &&
                (kind === 'flag' ? data.flags : data.crowns).slice(0, shown[kind]).map((it) => (
                  <ItemCard
                    key={it.id}
                    item={it}
                    kind={kind}
                    de={de}
                    votes={vk(kind, it.id)}
                    onVote={() => void vote(kind, it.id)}
                    preview={<img src={it.url} alt={it.name} loading="lazy" decoding="async" className="max-h-44 max-w-full object-contain" />}
                  />
                ))}
            </div>
            {count > shown[kind] && (
              <div className="flex justify-center">
                <button type="button" onClick={() => more(kind)} className="btn-ghost text-sm">
                  {de ? 'Mehr zeigen' : 'Show more'}
                </button>
              </div>
            )}
          </section>
        ))}
      {viewing && data && <GameView data={data} start={viewing} onClose={() => setViewing(null)} de={de} />}
    </div>
  )
}
