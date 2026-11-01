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
function PatternSwatch({ pattern, palette, size = 176 }: { pattern: string; palette: Palette | undefined; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    const p = decodePattern(pattern)
    if (!canvas || !p) return
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const tile = patternTile(p, palette)
    // as many pixels per game tile as fit two repeats into the picture (at least a fraction of one, never more than 6)
    const px = Math.min(6, size / (2 * Math.max(tile.width, tile.height)))
    ctx.imageSmoothingEnabled = false
    ctx.fillStyle = '#0b0f1c'
    ctx.fillRect(0, 0, size, size)
    const w = tile.width * px
    const h = tile.height * px
    for (let y = 0; y < size; y += h) for (let x = 0; x < size; x += w) ctx.drawImage(tile, x, y, w, h)
  }, [pattern, palette, size])
  return <canvas ref={ref} style={{ width: size, height: size }} className="max-w-full rounded-lg [image-rendering:pixelated]" aria-hidden />
}

function Price({ item, de }: { item: Item; de: boolean }) {
  if (item.price != null)
    return (
      <span className="inline-flex items-center gap-1 font-display text-sm font-bold text-gold-light">
        {item.price.toLocaleString(de ? 'de-DE' : 'en-GB')} <CurrencyIcon currency="hard" className="h-4 w-4" />
      </span>
    )
  return <span className="text-xs text-slate-400">{item.paid ? (de ? 'Bezahlt im Store' : 'Paid in the store') : ''}</span>
}

function ItemCard({ item, kind, preview, votes, onVote, onView, de, children }: { item: Item; kind: Kind; preview: ReactNode; votes: { count: number; mine: boolean }; onVote: () => void; onView: () => void; de: boolean; children?: ReactNode }) {
  return (
    <div className={`flex flex-col items-center gap-2 rounded-xl border bg-base-900/70 p-3 text-center ${RARITY[item.rarity ?? 'common'] ?? RARITY.common}`}>
      <div className="flex min-h-[11rem] w-full items-center justify-center overflow-hidden">{preview}</div>
      {children}
      <p className="w-full truncate text-sm font-semibold text-white" title={item.name}>
        {item.name.replace(/_/g, ' ')}
      </p>
      <p className="text-[11px] uppercase tracking-wide">
        {item.rarity ?? ''} · {kind === 'pattern' ? (de ? 'Skin' : 'Skin') : kind === 'flag' ? (de ? 'Flagge' : 'Flag') : de ? 'Krone' : 'Crown'}
      </p>
      <Price item={item} de={de} />
      {item.artist && (
        <p className="text-[11px] text-slate-500">
          {de ? 'von' : 'by'} {item.artist}
        </p>
      )}
      <div className="mt-1 flex w-full items-center justify-center gap-2">
        <button
          type="button"
          onClick={onVote}
          aria-pressed={votes.mine}
          title={de ? 'Lieblings-Skin: Upvote' : 'Favourite: upvote'}
          className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${votes.mine ? 'border-gold bg-gold/20 text-gold-light' : 'border-base-600 text-slate-300 hover:border-gold/60 hover:text-gold-light'}`}
        >
          ▲ {votes.count}
        </button>
        <button type="button" onClick={onView} className="rounded-lg border border-base-600 px-2.5 py-1 text-xs font-semibold text-slate-300 transition-colors hover:border-accent hover:text-white">
          {de ? 'Im Spiel ansehen' : 'In-game view'}
        </button>
      </div>
    </div>
  )
}

interface View {
  pattern: string | null
  palette: number
  flag: string | null
  crown: string | null
}

/** "In game": a piece of map with the territory of a player (pattern), the name with the flag and the crown above it. */
function GameView({ data, start, onClose, de }: { data: Cosmetics; start: View; onClose: () => void; de: boolean }) {
  const [view, setView] = useState<View>(start)
  const ref = useRef<HTMLCanvasElement>(null)
  const pattern = data.patterns.find((p) => p.id === view.pattern)
  const flag = data.flags.find((f) => f.id === view.flag)
  const crown = data.crowns.find((c) => c.id === view.crown)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    let alive = true
    const W = 720
    const H = 420
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d')!
    const load = (src: string | undefined) =>
      new Promise<HTMLImageElement | null>((resolve) => {
        if (!src) return resolve(null)
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = () => resolve(null)
        img.src = src
      })
    void (async () => {
      const [flagImg, crownImg] = await Promise.all([load(flag?.url), load(crown?.url)])
      if (!alive) return
      // the sea and a bit of land around the territory, like the game's map
      ctx.fillStyle = '#1b3a5c'
      ctx.fillRect(0, 0, W, H)
      ctx.fillStyle = '#2a4f78'
      for (let i = 0; i < 90; i++) ctx.fillRect((i * 97) % W, (i * 53) % H, 22, 4)
      // the territory: a fixed lumpy shape
      const cx = W / 2
      const cy = H / 2 + 20
      ctx.beginPath()
      const pts = 28
      for (let i = 0; i <= pts; i++) {
        const a = (i / pts) * Math.PI * 2
        const r = 150 + 22 * Math.sin(a * 3 + 1) + 14 * Math.sin(a * 5 + 2) + 9 * Math.sin(a * 9)
        const x = cx + Math.cos(a) * r * 1.35
        const y = cy + Math.sin(a) * r * 0.72
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.closePath()
      const decoded = pattern ? decodePattern(pattern.pattern) : null
      if (decoded && pattern) {
        const tile = patternTile(decoded, pattern.palettes[view.palette] ?? pattern.palettes[0])
        // one game tile is 4 pixels in this view
        const big = document.createElement('canvas')
        big.width = tile.width * 4
        big.height = tile.height * 4
        const bctx = big.getContext('2d')!
        bctx.imageSmoothingEnabled = false
        bctx.drawImage(tile, 0, 0, big.width, big.height)
        ctx.fillStyle = ctx.createPattern(big, 'repeat') ?? '#3b82f6'
      } else ctx.fillStyle = '#3b82f6'
      ctx.fill()
      ctx.lineWidth = 3
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'
      ctx.stroke()
      // name with flag and crown
      const name = 'Zilka'
      ctx.font = '700 34px Inter, system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const tw = ctx.measureText(name).width
      const flagW = flagImg ? 44 : 0
      const total = tw + (flagW ? flagW + 10 : 0)
      const left = cx - total / 2
      if (flagImg) {
        const fh = (flagW * flagImg.naturalHeight) / flagImg.naturalWidth
        ctx.drawImage(flagImg, left, cy - fh / 2, flagW, fh)
      }
      ctx.lineWidth = 6
      ctx.strokeStyle = 'rgba(0,0,0,0.85)'
      ctx.fillStyle = '#ffffff'
      const textX = left + (flagW ? flagW + 10 : 0) + tw / 2
      ctx.strokeText(name, textX, cy)
      ctx.fillText(name, textX, cy)
      if (crownImg) {
        const cw = 70
        const ch = (cw * crownImg.naturalHeight) / crownImg.naturalWidth
        ctx.drawImage(crownImg, cx - cw / 2, cy - 28 - ch, cw, ch)
      }
    })()
    return () => {
      alive = false
    }
  }, [pattern, flag, crown, view.palette])

  const sel = 'rounded-lg border border-base-600 bg-base-800 px-2 py-1.5 text-sm text-white'
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto bg-black/85 p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label={de ? 'Im Spiel ansehen' : 'In-game view'}>
      <div className="w-full max-w-3xl space-y-3 rounded-2xl border border-accent/40 bg-base-900 p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-xl font-bold text-white">{de ? 'So sieht es im Spiel aus' : 'How it looks in game'}</h2>
          <button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-slate-400 hover:bg-base-800 hover:text-white" aria-label={de ? 'Schließen' : 'Close'}>
            ✕
          </button>
        </div>
        <canvas ref={ref} className="w-full rounded-xl border border-base-700" style={{ aspectRatio: '720 / 420' }} />
        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
          <label className="flex items-center gap-2">
            {de ? 'Skin' : 'Skin'}
            <select
              className={sel}
              value={view.pattern ?? ''}
              onChange={(e) => setView({ ...view, pattern: e.target.value || null, palette: 0 })}
            >
              <option value="">{de ? 'ohne' : 'none'}</option>
              {data.patterns.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </label>
          {pattern && pattern.palettes.length > 1 && (
            <span className="flex gap-1">
              {pattern.palettes.map((p, n) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => setView({ ...view, palette: n })}
                  title={p.name.replace(/_/g, ' ')}
                  aria-label={p.name}
                  className={`h-5 w-5 rounded-full border-2 ${n === view.palette ? 'border-white' : 'border-base-600'}`}
                  style={{ background: `linear-gradient(135deg, ${p.primary} 50%, ${p.secondary} 50%)` }}
                />
              ))}
            </span>
          )}
          <label className="flex items-center gap-2">
            {de ? 'Flagge' : 'Flag'}
            <select className={sel} value={view.flag ?? ''} onChange={(e) => setView({ ...view, flag: e.target.value || null })}>
              <option value="">{de ? 'ohne' : 'none'}</option>
              {data.flags.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            {de ? 'Krone' : 'Crown'}
            <select className={sel} value={view.crown ?? ''} onChange={(e) => setView({ ...view, crown: e.target.value || null })}>
              <option value="">{de ? 'ohne' : 'none'}</option>
              {data.crowns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </label>
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

  useEffect(() => {
    let alive = true
    setData(null)
    setError(false)
    setShown({ pattern: 36, flag: 36, crown: 36 })
    fetch(`/api/cosmetics?scope=${scope}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: Cosmetics) => {
        if (!alive) return
        const clean = (list: Item[]) => list.filter((i) => !HIDDEN.has(i.id))
        setData({ ...j, patterns: clean(j.patterns) as PatternItem[], flags: clean(j.flags) as ImageItem[], crowns: clean(j.crowns) as ImageItem[] })
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
            ? 'Alle Skin-Muster, Flaggen und Kronen des CYN-Stores auf einen Blick. Stimm für deine Lieblinge ab und sieh dir an, wie sie im Spiel aussehen. Kaufen kannst du sie direkt im Store von OpenFront.'
            : 'All skin patterns, flags and crowns of the CYN store at a glance. Upvote your favourites and see how they look in game. You buy them in OpenFront’s own store.'}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <a href={storeUrl} target="_blank" rel="noopener noreferrer" className="btn-gold">
            {de ? 'Zum Store' : 'Open the store'} ↗
          </a>
          {data && (
            <button type="button" onClick={() => setViewing({ pattern: data.patterns[0]?.id ?? null, palette: 0, flag: data.flags[0]?.id ?? null, crown: data.crowns[0]?.id ?? null })} className="btn-ghost">
              {de ? 'Im Spiel ansehen' : 'In-game view'}
            </button>
          )}
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
                      onView={() => setViewing({ pattern: it.id, palette: at, flag: null, crown: null })}
                      preview={<PatternSwatch pattern={it.pattern} palette={it.palettes[at]} />}
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
                    onView={() => setViewing({ pattern: null, palette: 0, flag: kind === 'flag' ? it.id : null, crown: kind === 'crown' ? it.id : null })}
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
