// ── Icon set ─────────────────────────────────────────────────────────────────
// Consistent stroke-based line icons (same style as the header's gear/discord
// icons) instead of emoji, which render inconsistently across devices/OSes.

type IconProps = { className?: string }
const base = 'h-4 w-4'

export const TrophyIcon = ({ className = base }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0V4Z" />
    <path d="M17 5h3a4 4 0 0 1-4 5M7 5H4a4 4 0 0 0 4 5" />
  </svg>
)

export const MedalIcon = ({ className = base }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="15" r="6" />
    <path d="m9 10-3-7M15 10l3-7M8.5 15.5 12 13l3.5 2.5" />
  </svg>
)

export const CrownIcon = ({ className = base }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m3 8 4 3 5-6 5 6 4-3-2 10H5L3 8Z" />
    <path d="M5 21h14" />
  </svg>
)

export const FlameIcon = ({ className = base }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2s-5 5.5-5 10a5 5 0 0 0 10 0c0-1.5-.7-2.5-1.3-3.3.1 1.7-.6 2.5-1.2 2.8C15 9 14 7 12 2Z" />
  </svg>
)

export const BellIcon = ({ className = base }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 8a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" />
    <path d="M10 21a2 2 0 0 0 4 0" />
  </svg>
)

export const BowIcon = ({ className = base }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 4a16 16 0 0 1 0 16M4 4l16 8L4 20" />
  </svg>
)

export const BoltIcon = ({ className = base }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />
  </svg>
)

export const PickaxeIcon = ({ className = base }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4.5 4.5c4 0 8 2 10.5 5M15 9.5 4 20M19.5 4.5c-4 0-8 2-10.5 5M8.5 9.5 20 19" />
  </svg>
)

export const AnchorIcon = ({ className = base }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="5" r="2" />
    <path d="M12 7v14M5 12H2a10 10 0 0 0 10 10 10 10 0 0 0 10-10h-3M6 12a6 6 0 0 0 12 0" />
  </svg>
)

export const BlastIcon = ({ className = base }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
    <circle cx="12" cy="12" r="4" />
  </svg>
)

export const WrenchIcon = ({ className = base }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.8 2.8-2-2Z" />
  </svg>
)

export const FlagIcon = ({ className = base }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 21V4M5 4h13l-3 4 3 4H5" />
  </svg>
)

export const SwordIcon = ({ className = base }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m14.5 17.5 3-3M3 21l6-6M14.5 6.5 20 1l3 3-5.5 5.5M14.5 6.5l3 3M14.5 6.5 9 12l3 3 5.5-5.5" />
  </svg>
)
export const ShieldIcon = ({ className = base }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
  </svg>
)
export const CoinIcon = ({ className = base }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v10M9.5 9.5h3.2a1.8 1.8 0 1 1 0 3.6H9.8a1.8 1.8 0 1 0 0 3.6h3.7" />
  </svg>
)
export const SkullIcon = ({ className = base }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2a7 7 0 0 0-7 7c0 2.4 1.1 4 2 5v3h2v-2h1.5v2h3v-2H15v2h2v-3c.9-1 2-2.6 2-5a7 7 0 0 0-7-7Z" />
    <circle cx="9.5" cy="10.5" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="14.5" cy="10.5" r="1.2" fill="currentColor" stroke="none" />
  </svg>
)
export const MapIcon = ({ className = base }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 20 3 18V4l6 2m0 14 6-2m-6 2V6m6 12 6 2V6l-6-2m0 16V4m0 2-6-2" />
  </svg>
)

/** Rank medal for #1/#2/#3 leaderboard rows (gold/silver/bronze), plain number after. */
export function RankMedal({ rank, className = 'h-4 w-4' }: { rank: number; className?: string }) {
  if (rank > 3) return <span className="tabular-nums text-slate-500">#{rank}</span>
  const color = rank === 1 ? '#f2c14e' : rank === 2 ? '#c0c0c0' : '#cd7f32'
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="15" r="6" fill={`${color}33`} />
      <path d="m9 10-3-7M15 10l3-7" />
      <text x="12" y="18" textAnchor="middle" fontSize="8" fill={color} stroke="none" fontWeight="bold">
        {rank}
      </text>
    </svg>
  )
}
