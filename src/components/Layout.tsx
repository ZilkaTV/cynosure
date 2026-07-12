import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import CynLogo from './CynLogo'
import { CLAN_NAME, CLAN_TAG, DISCORD_INVITE } from '../config'
import { useProfile } from '../lib/useProfile'
import { clearLocalProfile } from '../lib/profiles'
import { supabase } from '../lib/supabase'

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

const GearIcon = ({ className = 'h-4 w-4' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
)

function trackingSince(): string {
  try {
    let d = localStorage.getItem('cyn:trackedSince')
    if (!d) {
      d = new Date().toISOString()
      localStorage.setItem('cyn:trackedSince', d)
    }
    return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return '-'
  }
}

function AccountMenu() {
  const { profile, refresh } = useProfile()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  if (!profile) {
    return (
      <Link to="/register" className="inline-flex items-center gap-2 rounded-lg bg-[#5865F2] px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#4752c4]">
        <DiscordIcon />
        <span className="hidden sm:inline">Register</span>
      </Link>
    )
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="btn-ghost inline-flex items-center gap-2 !px-3 !py-2 text-sm"
        aria-label="Account menu"
      >
        <GearIcon />
        <span className="hidden max-w-[8rem] truncate sm:inline">{profile.in_game_name}</span>
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-48 overflow-hidden rounded-lg border border-base-600 bg-base-850 shadow-xl">
          <Link to={`/member/${profile.openfront_id}`} onClick={() => setOpen(false)} className="block px-4 py-2.5 text-sm text-slate-200 hover:bg-base-800">
            My profile
          </Link>
          <Link to="/register" onClick={() => setOpen(false)} className="block px-4 py-2.5 text-sm text-slate-200 hover:bg-base-800">
            Settings
          </Link>
          <button
            onClick={async () => {
              setOpen(false)
              clearLocalProfile()
              if (supabase) await supabase.auth.signOut()
              refresh()
            }}
            className="block w-full px-4 py-2.5 text-left text-sm text-signal-red hover:bg-base-800"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-base-700 bg-base-950/60">
        {/* top-right account menu - floated so the crest stays centred */}
        <div className="mx-auto flex max-w-7xl justify-end px-4 pt-3 sm:px-6">
          <AccountMenu />
        </div>

        {/* centred crest - always links home */}
        <Link to="/" className="-mt-6 flex flex-col items-center gap-2 pb-2" aria-label={`${CLAN_NAME} home`}>
          <CynLogo className="h-28 w-28 drop-shadow-[0_0_20px_rgba(139,92,246,0.5)] sm:h-32 sm:w-32" />
          <span className="font-display text-3xl font-bold tracking-[0.3em] text-white sm:text-4xl">
            [{CLAN_TAG}] <span className="text-gold">{CLAN_NAME.toUpperCase()}</span>
          </span>
        </Link>

        {/* sub navigation - centred */}
        <nav className="mx-auto flex max-w-7xl items-center justify-center gap-1 overflow-x-auto px-4 pb-3 pt-1 sm:px-6">
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

      <main className="w-full px-4 py-8 sm:px-8">{children}</main>

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
        <p className="mt-1 text-xs text-slate-600">Tracking data since {trackingSince()}.</p>
      </footer>
    </div>
  )
}
