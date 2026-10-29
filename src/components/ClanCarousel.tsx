import { useState, type ReactNode } from 'react'

export interface CarouselSlide {
  key: string
  title: string
  node: ReactNode
}

/**
 * A small window in the sidebar that shows one slide at a time: arrows to the left and right, and a row of dots below
 * (one per slide, the current one marked in colour).
 */
export function ClanCarousel({ slides, heading }: { slides: CarouselSlide[]; heading?: string }) {
  const [index, setIndex] = useState(0)
  if (slides.length === 0) return null
  const current = Math.min(index, slides.length - 1)
  const go = (to: number) => setIndex((to + slides.length) % slides.length)
  const slide = slides[current]

  return (
    <div className="panel mt-4 overflow-hidden" aria-roledescription="carousel">
      {heading && <p className="border-b border-base-700 px-4 py-2 text-center text-[10px] font-semibold uppercase tracking-widest text-slate-400">{heading}</p>}
      <div className="flex items-center justify-between border-b border-base-700 px-2 py-2">
        <button type="button" onClick={() => go(current - 1)} aria-label="Previous" className="rounded-md px-2.5 py-1 text-lg leading-none text-slate-300 hover:bg-base-800 hover:text-white">
          ‹
        </button>
        <span className="font-display text-xs font-bold uppercase tracking-wide text-gold">{slide.title}</span>
        <button type="button" onClick={() => go(current + 1)} aria-label="Next" className="rounded-md px-2.5 py-1 text-lg leading-none text-slate-300 hover:bg-base-800 hover:text-white">
          ›
        </button>
      </div>
      <div className="flex min-h-[6.5rem] items-center justify-center px-3 py-3 sm:min-h-[9rem] sm:px-4 sm:py-4" role="group" aria-label={`${current + 1} / ${slides.length}`}>
        <div className="w-full">{slide.node}</div>
      </div>
      <div className="flex items-center justify-center gap-2 border-t border-base-700 px-3 py-2.5">
        {slides.map((s, i) => (
          <button
            key={s.key}
            type="button"
            onClick={() => go(i)}
            aria-label={`${i + 1} / ${slides.length}: ${s.title}`}
            aria-current={i === current}
            className={`h-2.5 rounded-full transition-all ${i === current ? 'w-6 bg-gold' : 'w-2.5 bg-base-600 hover:bg-slate-500'}`}
          />
        ))}
      </div>
    </div>
  )
}
