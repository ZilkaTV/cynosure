import { useEffect, useRef, useState } from 'react'
import type { ComponentType, SVGProps } from 'react'
import type { Badge, BadgeTier, IconKey } from '../lib/badges'
import {
  TrophyIcon,
  MedalIcon,
  CrownIcon,
  FlameIcon,
  BellIcon,
  BowIcon,
  BoltIcon,
  PickaxeIcon,
  AnchorIcon,
  BlastIcon,
  WrenchIcon,
  FlagIcon,
  ChatBubbleIcon,
  HeartIcon,
  HandshakeIcon,
  StarIcon,
  ShipIcon,
  ShieldIcon,
} from './BadgeIcons'
import { useLanguage } from '../i18n/LanguageContext'

const TIER_RING: Record<BadgeTier, string> = {
  bronze: 'ring-2 ring-[#cd7f32]/70',
  silver: 'ring-2 ring-[#c0c0c0]/70',
  gold: 'ring-2 ring-[#f2c14e]/70',
  diamond: 'ring-2 ring-[#7fe3f0]/70',
}

// Same hex values as TIER_RING, applied to the icon itself via `text-` (the
// icons use fill="currentColor") - a single star/ship shape recolored by
// tier reads clearer at small sizes than swapping in a different medal shape
// per tier ever did.
const TIER_ICON_COLOR: Record<BadgeTier, string> = {
  bronze: 'text-[#cd7f32]',
  silver: 'text-[#c0c0c0]',
  gold: 'text-[#f2c14e]',
  diamond: 'text-[#7fe3f0]',
}

const ICON_COMPONENT: Record<IconKey, ComponentType<SVGProps<SVGSVGElement>>> = {
  trophy: TrophyIcon,
  medal: MedalIcon,
  crown: CrownIcon,
  flame: FlameIcon,
  bell: BellIcon,
  bow: BowIcon,
  bolt: BoltIcon,
  pickaxe: PickaxeIcon,
  anchor: AnchorIcon,
  blast: BlastIcon,
  wrench: WrenchIcon,
  flag: FlagIcon,
  chatBubble: ChatBubbleIcon,
  heart: HeartIcon,
  handshake: HandshakeIcon,
}

/** Renders a badge's visual: the level number for the level badge, an icon otherwise. */
function BadgeVisual({ badge, className }: { badge: Badge; className?: string }) {
  if (badge.kind === 'level') {
    return (
      <span className={`flex items-center justify-center font-display font-bold text-gold-light ${className}`}>
        {badge.level}
      </span>
    )
  }
  const tierColor = badge.tier ? TIER_ICON_COLOR[badge.tier] : ''
  // 1v1 (star) and 2v2 (shield) use deliberately different shapes, not just
  // different tier colors, so the two ladders read as distinct at a glance
  // instead of only differing by hover-text.
  if (badge.kind === 'star') return <StarIcon className={`${className} ${tierColor}`} aria-label={badge.name} />
  if (badge.kind === 'shield') return <ShieldIcon className={`${className} ${tierColor}`} aria-label={badge.name} />
  if (badge.kind === 'ship') return <ShipIcon className={`${className} ${tierColor}`} aria-label={badge.name} />
  const Icon = badge.icon ? ICON_COMPONENT[badge.icon] : null
  return Icon ? <Icon className={className} aria-label={badge.name} /> : null
}

/** Compact earned-only badges (for the roster / overview). */
export function BadgeStrip({ badges }: { badges: Badge[] }) {
  const earned = badges.filter((b) => b.earned)
  const [openId, setOpenId] = useState<string | null>(null)
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!openId) return
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpenId(null)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [openId])

  if (earned.length === 0) return <span className="text-slate-700">-</span>
  return (
    <span className="relative inline-flex flex-wrap items-center justify-center gap-1" ref={ref}>
      {earned.map((b) => (
        <span key={b.id} className="relative">
          <button
            type="button"
            onClick={() => setOpenId((id) => (id === b.id ? null : b.id))}
            onMouseEnter={() => setOpenId(b.id)}
            onMouseLeave={() => setOpenId((id) => (id === b.id ? null : id))}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-full bg-base-800/80 text-gold-light ${b.tier ? TIER_RING[b.tier] : ''}`}
          >
            <BadgeVisual badge={b} className="h-5 w-5 text-xs" />
          </button>
          {openId === b.id && (
            <div className="absolute left-1/2 top-full z-50 mt-1.5 w-48 -translate-x-1/2 rounded-lg border border-base-600 bg-base-850 p-2.5 text-left shadow-xl">
              <p className="text-xs font-semibold text-white">{b.name}</p>
              <p className="mt-0.5 text-[11px] text-slate-400">{b.desc}</p>
            </div>
          )}
        </span>
      ))}
    </span>
  )
}

/** Full badge board (for the profile): earned in colour, others greyed. */
export function BadgeBoard({ badges }: { badges: Badge[] }) {
  const { t } = useLanguage()
  const groups: { key: Badge['group']; label: string }[] = [
    { key: 'rank', label: t.badges.groupRank },
    { key: 'monthly', label: t.badges.groupMonthly },
    { key: 'milestone', label: t.badges.groupMilestone },
  ]
  return (
    <div className="space-y-5">
      {groups.map((g) => {
        const items = badges.filter((b) => b.group === g.key)
        return (
          <div key={g.key}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">{g.label}</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {items.map((b) => (
                <div
                  key={b.id}
                  className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 ${
                    b.earned ? 'border-gold/30 bg-gold/5' : 'border-base-700 bg-base-850/40 opacity-55'
                  }`}
                >
                  <span
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-base-800 ${b.earned ? 'text-gold-light' : 'text-slate-500'} ${b.tier && b.earned ? TIER_RING[b.tier] : ''}`}
                  >
                    <BadgeVisual badge={b} className="h-7 w-7 text-base" />
                  </span>
                  <div className="min-w-0">
                    <p className={`text-sm font-semibold ${b.earned ? 'text-white' : 'text-slate-400'}`}>
                      {b.name}
                      {b.tier && b.earned && <span className="ml-1 text-xs capitalize text-slate-400">{b.tier}</span>}
                    </p>
                    <p className="text-[11px] text-slate-500">{b.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
