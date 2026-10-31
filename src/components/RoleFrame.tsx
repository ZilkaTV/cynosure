import type { CSSProperties, ReactNode } from 'react'
import { winsRoleGradient } from '../lib/badges'
import { Bolts } from './RoleName'

export type RoleFrameKind = 'none' | 'bronze' | 'shine' | 'bolt'

/** The frame a member's Discord wins role earns: bronze a brown edge, silver and gold a shimmering one in the role's colour, diamond and above a glowing one with lightning. */
export function roleFrameKind(wins: number | undefined | null): RoleFrameKind {
  if (wins == null || winsRoleGradient(wins) == null) return 'none'
  if (wins >= 500) return 'bolt'
  if (wins >= 100) return 'shine'
  return 'bronze'
}

/**
 * Puts the frame of the member's wins role around its content (banner, icon). Without a role the content gets `plain` instead (an ordinary edge).
 * `radius` is the corner radius of the outside, `width` the thickness of the frame in px. The lightning is drawn around the frame (not on big banners: `bolts={false}`).
 */
export default function RoleFrame({
  wins,
  radius = '1rem',
  width = 3,
  bolts = true,
  className = '',
  plain = '',
  children,
}: {
  wins: number | undefined | null
  radius?: string
  width?: number
  bolts?: boolean
  className?: string
  plain?: string
  children: ReactNode
}) {
  const kind = roleFrameKind(wins)
  const colors = wins == null ? null : winsRoleGradient(wins)
  if (kind === 'none' || !colors) {
    return (
      <div className={`overflow-hidden ${className} ${plain}`} style={{ borderRadius: radius }}>
        {children}
      </div>
    )
  }
  const withBolts = kind === 'bolt' && bolts
  return (
    <div
      className={`role-frame role-frame-${kind} ${withBolts ? 'role-bolts' : ''} ${className}`}
      style={{ '--c1': colors[0], '--c2': colors[1], '--fw': `${width}px`, '--fr': radius } as CSSProperties}
    >
      <div className="role-frame-inner">{children}</div>
      {withBolts && <Bolts />}
    </div>
  )
}
