import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { DEFAULT_FIT, type Fit } from '../lib/profileExtras'

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/**
 * A picture inside a frame, placed like the owner wants it: it covers the frame, is zoomed by `fit.zoom` (1 = just covering) and shifted so that
 * `fit.x` / `fit.y` (0-100 percent) of what overflows is cut off on the left / top. The same numbers give the same picture in a big frame and a
 * small one. With `onFit` the picture can be dragged with the mouse or a finger (the owner is editing).
 * The parent decides the size of the frame (the component fills it).
 */
export default function FitImage({ src, alt = '', fit, onFit, className = '' }: { src: string; alt?: string; fit?: Fit | null; onFit?: (f: Fit) => void; className?: string }) {
  const frame = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState<{ w: number; h: number } | null>(null)
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  const drag = useRef<{ x: number; y: number; fit: Fit } | null>(null)
  const f = fit ?? DEFAULT_FIT

  useEffect(() => {
    const el = frame.current
    if (!el) return
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  useEffect(() => setNatural(null), [src])

  // size of the picture when it covers the frame, times the zoom
  let layout: { w: number; h: number; left: number; top: number; ox: number; oy: number } | null = null
  if (box && natural && box.w > 0 && box.h > 0) {
    const cover = Math.max(box.w / natural.w, box.h / natural.h) * f.zoom
    const w = natural.w * cover
    const h = natural.h * cover
    const ox = Math.max(0, w - box.w)
    const oy = Math.max(0, h - box.h)
    layout = { w, h, ox, oy, left: -ox * (f.x / 100), top: -oy * (f.y / 100) }
  }

  function down(e: PointerEvent) {
    if (!onFit) return
    try {
      e.currentTarget.setPointerCapture(e.pointerId) // keeps the drag going when the pointer leaves the frame
    } catch {
      /* not an active pointer */
    }
    drag.current = { x: e.clientX, y: e.clientY, fit: f }
  }
  function move(e: PointerEvent) {
    const d = drag.current
    if (!d || !onFit || !layout) return
    // dragging the picture to the right shows more of its left side: the cut-off share on the left gets smaller
    const x = layout.ox > 0 ? clamp(d.fit.x - ((e.clientX - d.x) / layout.ox) * 100, 0, 100) : d.fit.x
    const y = layout.oy > 0 ? clamp(d.fit.y - ((e.clientY - d.y) / layout.oy) * 100, 0, 100) : d.fit.y
    onFit({ ...d.fit, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 })
  }
  function up() {
    drag.current = null
  }

  return (
    <div
      ref={frame}
      className={`relative h-full w-full overflow-hidden ${onFit ? 'cursor-move touch-none' : ''} ${className}`}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
        // until the size is known the picture simply covers the frame
        className={layout ? 'absolute max-w-none select-none' : 'h-full w-full select-none object-cover'}
        style={layout ? { width: layout.w, height: layout.h, left: layout.left, top: layout.top } : undefined}
      />
    </div>
  )
}
