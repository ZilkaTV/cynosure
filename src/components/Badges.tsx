import { useEffect, useRef, useState } from 'react'
import type { Badge, BadgeTier, IconKey } from '../lib/badges'
import { Emoji, EMOJI } from './Emoji'
import { useLanguage } from '../i18n/LanguageContext'

const TIER_RING: Record<BadgeTier, string> = {
  bronze: 'ring-2 ring-[#cd7f32]/70',
  silver: 'ring-2 ring-[#c0c0c0]/70',
  gold: 'ring-2 ring-[#f2c14e]/70',
  diamond: 'ring-2 ring-[#7fe3f0]/70',
}

const TIER_EMOJI: Record<BadgeTier, string> = {
  bronze: EMOJI.bronze,
  silver: EMOJI.silver,
  gold: EMOJI.gold,
  diamond: '💎',
}

const ICON_EMOJI: Record<IconKey, string> = {
  trophy: EMOJI.trophy,
  medal: EMOJI.medal,
  crown: EMOJI.crown,
  flame: EMOJI.flame,
  bell: EMOJI.bell,
  bow: EMOJI.bow,
  bolt: EMOJI.bolt,
  pickaxe: EMOJI.pickaxe,
  anchor: EMOJI.anchor,
  blast: EMOJI.blast,
  wrench: EMOJI.wrench,
  flag: EMOJI.flag,
}

/** Picks which emoji represents a badge (tiered star/ship badges swap by tier). */
function emojiFor(badge: Badge): string {
  if (badge.kind === 'star') return badge.tier ? TIER_EMOJI[badge.tier] : EMOJI.star
  if (badge.kind === 'ship') return EMOJI.ship
  return badge.icon ? ICON_EMOJI[badge.icon] : '❔'
}

/** Renders a badge's visual: the level number for the level badge, an emoji otherwise. */
function BadgeVisual({ badge, className }: { badge: Badge; className?: string }) {
  if (badge.kind === 'level') {
    return (
      <span className={`flex items-center justify-center font-display font-bold text-gold-light ${className}`}>
        {badge.level}
      </span>
    )
  }
  return <Emoji char={emojiFor(badge)} label={badge.name} className={className} />
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
            className={`inline-flex h-6 w-6 items-center justify-center rounded-full bg-base-800/80 ${b.tier ? TIER_RING[b.tier] : ''}`}
          >
            <BadgeVisual badge={b} className="h-4 w-4 text-xs" />
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
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-base-800 ${b.tier && b.earned ? TIER_RING[b.tier] : ''}`}>
                    <BadgeVisual badge={b} className="h-5 w-5 text-sm" />
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
