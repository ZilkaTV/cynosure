// Hand-rolled SVG line chart - matches this codebase's existing pattern of
// small SVG components (RankMedal, the profile win/loss donut, etc.) instead
// of pulling in a charting library for one shape.

import { useRef, useState } from 'react'

interface Point {
  date: string
  value: number | null
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export default function TrendChart({
  points,
  color = '#8b5cf6',
  height = 96,
  formatValue = (v: number) => String(Math.round(v)),
  emptyLabel,
}: {
  points: Point[]
  color?: string
  height?: number
  formatValue?: (v: number) => string
  emptyLabel: string
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  const valid = points.filter((p): p is { date: string; value: number } => p.value != null)

  if (valid.length < 2) {
    return (
      <div className="flex items-center justify-center text-xs text-slate-500" style={{ height }}>
        {emptyLabel}
      </div>
    )
  }

  const values = valid.map((p) => p.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const width = 100
  const padY = 12
  const stepX = width / (valid.length - 1)
  const toY = (v: number) => padY + (1 - (v - min) / span) * (height - padY * 2)

  // First occurrence of each - if the peak/trough is held on multiple days
  // (a flat streak), the earliest one is the more meaningful "when it was
  // first reached" point to mark rather than picking arbitrarily.
  const peakIdx = values.indexOf(max)
  const troughIdx = values.indexOf(min)

  const pathD = valid.map((p, i) => `${i === 0 ? 'M' : 'L'} ${(i * stepX).toFixed(2)} ${toY(p.value).toFixed(2)}`).join(' ')
  const first = valid[0]
  const last = valid[valid.length - 1]
  const delta = last.value - first.value
  const deltaColor = delta > 0 ? 'text-signal-green' : delta < 0 ? 'text-signal-red' : 'text-slate-500'

  function indexFromClientX(clientX: number): number {
    const rect = svgRef.current!.getBoundingClientRect()
    const fraction = rect.width > 0 ? (clientX - rect.left) / rect.width : 0
    return Math.max(0, Math.min(valid.length - 1, Math.round(fraction * (valid.length - 1))))
  }

  const hovered = hoverIdx !== null ? valid[hoverIdx] : null
  // Flip the tooltip to the other side once the hovered point is past the
  // chart's midpoint, so it doesn't run off the edge of its (often narrow,
  // e.g. 3-per-row on the member cards) container.
  const tooltipSide = hoverIdx !== null && hoverIdx > (valid.length - 1) / 2 ? 'right-0' : 'left-0'

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        preserveAspectRatio="none"
        className="overflow-visible cursor-crosshair"
        onMouseMove={(e) => setHoverIdx(indexFromClientX(e.clientX))}
        onMouseLeave={() => setHoverIdx(null)}
        // Touch devices never fire mousemove - onTouchStart/Move fills the
        // same role for a finger drag across the chart. No preventDefault:
        // this chart is much narrower than the page is tall, so letting the
        // page keep scrolling under a touch here does more good than harm.
        onTouchStart={(e) => setHoverIdx(indexFromClientX(e.touches[0].clientX))}
        onTouchMove={(e) => setHoverIdx(indexFromClientX(e.touches[0].clientX))}
        onTouchEnd={() => setHoverIdx(null)}
      >
        <path d={pathD} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />

        {/* Peak/trough markers - always visible, not just on hover, so "where
            was the high/low" is answerable at a glance. Skipped when they
            coincide with the current hover dot below, to avoid two rings
            stacked on the exact same point. */}
        {peakIdx !== troughIdx && (
          <>
            {hoverIdx !== peakIdx && (
              <circle cx={(peakIdx * stepX).toFixed(2)} cy={toY(max).toFixed(2)} r="1.8" fill="none" stroke="#4ade80" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            )}
            {hoverIdx !== troughIdx && (
              <circle cx={(troughIdx * stepX).toFixed(2)} cy={toY(min).toFixed(2)} r="1.8" fill="none" stroke="#f87171" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            )}
          </>
        )}

        {hovered ? (
          <>
            <line
              x1={(hoverIdx! * stepX).toFixed(2)}
              x2={(hoverIdx! * stepX).toFixed(2)}
              y1={padY}
              y2={height - padY}
              stroke={color}
              strokeOpacity="0.25"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <circle cx={(hoverIdx! * stepX).toFixed(2)} cy={toY(hovered.value).toFixed(2)} r="3" fill={color} stroke="white" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          </>
        ) : (
          <circle cx={((valid.length - 1) * stepX).toFixed(2)} cy={toY(last.value).toFixed(2)} r="2.5" fill={color} />
        )}
      </svg>

      {hovered && (
        <div className={`pointer-events-none absolute top-0 z-10 -translate-y-full rounded-md border border-base-600 bg-base-900 px-2 py-1 text-xs shadow-lg ${tooltipSide}`}>
          <p className="whitespace-nowrap font-semibold text-white">{formatValue(hovered.value)}</p>
          <p className="whitespace-nowrap text-slate-400">{fmtDate(hovered.date)}</p>
          {hoverIdx === peakIdx && peakIdx !== troughIdx && <p className="whitespace-nowrap text-signal-green">▲ peak</p>}
          {hoverIdx === troughIdx && peakIdx !== troughIdx && <p className="whitespace-nowrap text-signal-red">▼ low</p>}
        </div>
      )}

      <div className="mt-1 flex items-center justify-between text-xs">
        <span className="text-slate-500">{formatValue(first.value)}</span>
        <span className={`font-semibold ${deltaColor}`}>
          {delta > 0 ? '+' : ''}
          {formatValue(delta)}
        </span>
        <span className="font-medium text-white">{formatValue(last.value)}</span>
      </div>
    </div>
  )
}
