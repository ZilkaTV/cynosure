import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import CynLogo from './CynLogo'
import { CLAN_NAME, CLAN_TAG, DISCORD_INVITE } from '../config'
import { useProfile } from '../lib/useProfile'

const navItems = [
  { to: '/', label: 'Overview', end: true },
  { to: '/monthly/ffa', label: 'Monthly FFA' },
  { to: '/monthly/team', label: 'Monthly Team' },
  { to: '/monthly/1v1', label: 'Monthly 1v1' },
]

const DiscordIcon = ({ className = 'h-4 w-4' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M20.317 4.369A19.79 19.79 0 0 0 15.885 3c-.213.38-.462.893-.634 1.301a18.27 18.27 0 0 0-5.5 0A12.6 12.6 0 0 0 9.115 3a19.74 19.74 0 0 0-4.435 1.371C1.4 9.043.65 13.6.925 18.096a19.9 19.9 0 0 0 6.06 3.06c.49-.665.926-1.372 1.302-2.115a12.9 12.9 0 0 1-2.049-.98c.172-.125.34-.256.503-.392a14.19 14.19 0 0 0 12.516 0c.166.14.334.27.503.392-.65.385-1.336.71-2.052.982.377.742.812 1.45 1.303 2.114a19.83 19.83 0 0 0 6.064-3.06c.323-5.218-.552-9.735-2.758-13.727ZM8.68 15.331c-1.017 0-1.85-.933-1.85-2.081 0-1.148.815-2.082 1.85-2.082 1.044 0 1.867.943 1.85 2.082 0 1.148-.815 2.081-1.85 2.081Zm6.646 0c-1.017 0-1.85-.933-1.85-2.081 0-1.148.815-2.082 1.85-2.082 1.044 0 1.867.943 1.85 2.082 0 1.148-.806 2.081-1.85 2.081Z" />
  </svg>
)

export default function Layout({ children }: { children: ReactNode }) {
  const { profile } = useProfile()

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 border-b border-base-700 bg-base-950/85 backdrop-blur-md">
        <div className="mx-auto grid max-w-6xl grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-3 sm:px-6">
          {/* left spacer keeps the crest optically centred */}
          <div className="hidden sm:block" />

          {/* centred crest — always links home */}
          <Link to="/" className="mx-auto flex flex-col items-center gap-1" aria-label={`${CLAN_NAME} home`}>
            <CynLogo className="h-14 w-14 drop-shadow-[0_0_12px_rgba(139,92,246,0.35)]" />
            <span className="font-display text-lg font-bold tracking-[0.25em] text-white">
              [{CLAN_TAG}] <span className="text-gold">{CLAN_NAME.toUpperCase()}</span>
            </span>
          </Link>

          {/* top-right: register-with-Discord */}
          <div className="flex items-center justify-end gap-2">
            {profile ? (
              <Link
                to="/register"
                className="btn-ghost !px-3 !py-2 text-sm max-w-[10rem] truncate"
                title="Your registration"
              >
                {profile.in_game_name}
              </Link>
            ) : (
              <Link to="/register" className="inline-flex items-center gap-2 rounded-lg bg-[#5865F2] px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#4752c4]">
                <DiscordIcon />
                <span className="hidden sm:inline">Register</span>
              </Link>
            )}
          </div>
        </div>

        {/* sub navigation */}
        <nav className="mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto px-4 pb-2 sm:px-6">
          {navItems.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => `nav-link whitespace-nowrap ${isActive ? 'nav-link-active' : ''}`}
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>

      <footer className="mt-16 border-t border-base-700 py-8 text-center text-sm text-slate-500">
        <p>
          [{CLAN_TAG}] {CLAN_NAME} · an OpenFront.io clan ·{' '}
          <a href={DISCORD_INVITE} target="_blank" rel="noreferrer" className="text-accent-light hover:text-accent">
            Discord
          </a>
        </p>
        <p className="mt-1 text-xs text-slate-600">
          Stats pulled live from the OpenFront public API. Only games played with the [{CLAN_TAG}] tag are counted.
        </p>
      </footer>
    </div>
  )
}
