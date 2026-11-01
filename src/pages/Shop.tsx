import { useEffect, useRef, useState } from 'react'
import { SectionHeading, Spinner } from '../components/ui'
import { useLanguage } from '../i18n/LanguageContext'

// The skin shop: the patterns (skins), flags and crowns of OpenFront's store, by default only the items of the CYN store (affiliate code "cyn").
// The data is OpenFront's public cosmetics file, read by the Worker (worker/cosmetics.js). A pattern is drawn here from its encoded tiles (the same
// format the game uses: a header with size and scale, then one bit per tile).

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
type Tab = 'patterns' | 'flags' | 'crowns'

const RARITY: Record<string, string> = {
  common: 'border-slate-500/60 text-slate-300',
  uncommon: 'border-emerald-500/60 text-emerald-300',
  rare: 'border-sky-500/60 text-sky-300',
  epic: 'border-purple-500/60 text-purple-300',
  legendary: 'border-amber-500/70 text-amber-300',
}

/** The pattern as pixels: the game's format is base64url, byte 0 = version, byte 1/2 = scale and size, then one bit per tile (0 = primary colour). */
function decodePattern(b64: string): { width: number; height: number; scale: number; bytes: Uint8Array } | null {
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

function PatternSwatch({ pattern, palette }: { pattern: string; palette: Palette | undefined }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    const p = decodePattern(pattern)
    if (!canvas || !p) return
    const SIZE = 128
    canvas.width = SIZE
    canvas.height = SIZE
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const primary = palette?.primary ?? '#ffffff'
    const secondary = palette?.secondary ?? '#334155'
    // one game tile is 2 pixels here, scaled like the game does (tile << scale)
    const px = 2
    const img = ctx.createImageData(SIZE, SIZE)
    const hex = (c: string) => [parseInt(c.slice(1, 3), 16) || 0, parseInt(c.slice(3, 5), 16) || 0, parseInt(c.slice(5, 7), 16) || 0]
    const a = hex(primary)
    const b = hex(secondary)
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const tx = Math.floor(x / px)
        const ty = Math.floor(y / px)
        const idx = ((ty >> p.scale) % p.height) * p.width + ((tx >> p.scale) % p.width)
        const bit = (p.bytes[3 + (idx >> 3)] & (1 << (idx & 7))) === 0
        const c = bit ? a : b
        const o = (y * SIZE + x) * 4
        img.data[o] = c[0]
        img.data[o + 1] = c[1]
        img.data[o + 2] = c[2]
        img.data[o + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
  }, [pattern, palette])
  return <canvas ref={ref} className="h-32 w-32 rounded-lg [image-rendering:pixelated]" aria-hidden />
}

function Card({ item, children, de }: { item: Item; children: React.ReactNode; de: boolean }) {
  return (
    <div className={`flex flex-col items-center gap-2 rounded-xl border bg-base-900/70 p-3 text-center ${RARITY[item.rarity ?? 'common'] ?? RARITY.common}`}>
      <div className="flex h-32 w-full items-center justify-center overflow-hidden">{children}</div>
      <p className="w-full truncate text-sm font-semibold text-white" title={item.name}>
        {item.name.replace(/_/g, ' ')}
      </p>
      <p className="text-[11px] uppercase tracking-wide">{item.rarity ?? ''}</p>
      <p className="text-xs text-slate-400">
        {item.price != null ? `${item.price.toLocaleString(de ? 'de-DE' : 'en-GB')} ${de ? 'Plutonium' : 'plutonium'}` : item.paid ? (de ? 'Bezahlt im Shop' : 'Paid in the shop') : ''}
        {item.artist ? <span className="block text-[11px] text-slate-500">{de ? 'von' : 'by'} {item.artist}</span> : null}
      </p>
    </div>
  )
}

/** Skin shop: patterns, flags and crowns of OpenFront's store, by default those of the CYN store. */
export default function Shop() {
  const { language } = useLanguage()
  const de = language === 'de'
  const [scope, setScope] = useState<'cyn' | 'all'>('cyn')
  const [tab, setTab] = useState<Tab>('patterns')
  const [data, setData] = useState<Cosmetics | null>(null)
  const [error, setError] = useState(false)
  const [shown, setShown] = useState(36)
  const [palette, setPalette] = useState<Record<string, number>>({})

  useEffect(() => {
    let alive = true
    setData(null)
    setError(false)
    setShown(36)
    fetch(`/api/cosmetics?scope=${scope}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: Cosmetics) => alive && setData(j))
      .catch(() => alive && setError(true))
    return () => {
      alive = false
    }
  }, [scope])

  const storeUrl = data?.storeUrl ?? 'https://openfront.io/#modal=store&affiliateCode=cyn'
  const list = data ? data[tab] : []
  const tabs: { id: Tab; label: string }[] = [
    { id: 'patterns', label: de ? 'Skins (Muster)' : 'Skins (patterns)' },
    { id: 'flags', label: de ? 'Flaggen' : 'Flags' },
    { id: 'crowns', label: de ? 'Kronen' : 'Crowns' },
  ]

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <SectionHeading center eyebrow={de ? 'OpenFront Store' : 'OpenFront store'} title="Skin Shop" />
      <div className="flex flex-col items-center gap-3 text-center">
        <p className="max-w-2xl text-sm text-slate-400">
          {de
            ? 'Alle Skin-Muster, Flaggen und Kronen des CYN-Stores. Kaufen kannst du sie direkt im Store von OpenFront: Über den Button unten landest du dort mit dem Clan-Code.'
            : 'All skin patterns, flags and crowns of the CYN store. You buy them in OpenFront’s own store: the button below takes you there with the clan code.'}
        </p>
        <a href={storeUrl} target="_blank" rel="noopener noreferrer" className="btn-gold">
          {de ? 'Zum Store' : 'Open the store'} ↗
        </a>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        {tabs.map((x) => (
          <button
            key={x.id}
            type="button"
            onClick={() => {
              setTab(x.id)
              setShown(36)
            }}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${tab === x.id ? 'bg-accent text-white' : 'bg-base-800 text-slate-400 hover:bg-base-700 hover:text-slate-200'}`}
          >
            {x.label}
            {data && <span className="ml-1.5 text-xs opacity-70">{data[x.id].length}</span>}
          </button>
        ))}
        <label className="ml-2 flex cursor-pointer items-center gap-1.5 text-xs text-slate-400">
          <input type="checkbox" checked={scope === 'all'} onChange={(e) => setScope(e.target.checked ? 'all' : 'cyn')} className="accent-[#8b5cf6]" />
          {de ? 'Alle Items von OpenFront zeigen' : 'Show all OpenFront items'}
        </label>
      </div>

      {error && <p className="text-center text-sm text-slate-400">{de ? 'Der Shop lässt sich gerade nicht laden.' : 'The shop cannot be loaded right now.'}</p>}
      {!data && !error && <Spinner />}
      {data && list.length === 0 && <p className="text-center text-sm text-slate-400">{de ? 'Hier gibt es noch nichts.' : 'Nothing here yet.'}</p>}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {tab === 'patterns' &&
          (list as PatternItem[]).slice(0, shown).map((it) => {
            const at = palette[it.id] ?? 0
            return (
              <Card key={it.id} item={it} de={de}>
                <div className="flex flex-col items-center gap-1.5">
                  <PatternSwatch pattern={it.pattern} palette={it.palettes[at]} />
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
                </div>
              </Card>
            )
          })}
        {tab !== 'patterns' &&
          (list as ImageItem[]).slice(0, shown).map((it) => (
            <Card key={it.id} item={it} de={de}>
              <img src={it.url} alt={it.name} loading="lazy" decoding="async" className="max-h-32 max-w-full object-contain" />
            </Card>
          ))}
      </div>
      {list.length > shown && (
        <div className="flex justify-center">
          <button type="button" onClick={() => setShown((n) => n + 36)} className="btn-ghost text-sm">
            {de ? 'Mehr zeigen' : 'Show more'}
          </button>
        </div>
      )}
    </div>
  )
}
