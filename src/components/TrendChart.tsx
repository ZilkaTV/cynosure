// Hand-rolled SVG line chart - matches this codebase's existing pattern of
// small SVG components (RankMedal, the profile win/loss donut, etc.) instead
// of pulling in a charting library for one shape.

interface Point {
  date: string
  value: number | null
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

  const pathD = valid.map((p, i) => `${i === 0 ? 'M' : 'L'} ${(i * stepX).toFixed(2)} ${toY(p.value).toFixed(2)}`).join(' ')
  const first = valid[0]
  const last = valid[valid.length - 1]
  const delta = last.value - first.value
  const deltaColor = delta > 0 ? 'text-signal-green' : delta < 0 ? 'text-signal-red' : 'text-slate-500'

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none" className="overflow-visible">
        <path d={pathD} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={((valid.length - 1) * stepX).toFixed(2)} cy={toY(last.value).toFixed(2)} r="2.5" fill={color} />
      </svg>
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
