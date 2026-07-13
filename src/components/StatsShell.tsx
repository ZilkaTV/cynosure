import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import DiscordWidget from './DiscordWidget'
import CynLogo from './CynLogo'
import { CLAN_TAG, DISCORD_INVITE, USEFUL_LINKS } from '../config'

/** Handy OpenFront community sites, shown to the right of the stats. */
export function UsefulLinks() {
  return (
    <div className="panel overflow-hidden">
      <div className="border-b border-base-700 px-4 py-3">
        <span className="font-display text-sm font-bold uppercase tracking-wide text-gold">Useful Links</span>
      </div>
      <ul className="divide-y divide-base-700/60">
        {USEFUL_LINKS.map((l) => (
          <li key={l.url}>
            <a
              href={l.url}
              target="_blank"
              rel="noreferrer"
              className="block px-4 py-2.5 transition-colors hover:bg-base-800/60"
            >
              <span className="flex items-center gap-1.5 text-sm font-medium text-slate-200">
                {l.label}
                <span className="text-slate-500">↗</span>
              </span>
              <span className="text-xs text-slate-500">{l.note}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Stats layout: Discord widget flush-left, content centred, useful-links panel
 * on the right. On mobile it collapses to one column (content, then widget,
 * then links).
 */
export function StatsShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)_260px] lg:gap-8 xl:grid-cols-[280px_minmax(0,1fr)_280px]">
      <div className="order-1 mx-auto w-full min-w-0 max-w-6xl space-y-10 lg:order-none lg:col-start-2 lg:row-start-1">
        {children}
      </div>
      <aside className="order-2 lg:order-none lg:col-start-1 lg:row-start-1 lg:sticky lg:top-6 lg:self-start">
        <DiscordWidget />
      </aside>
      <aside className="order-3 lg:order-none lg:col-start-3 lg:row-start-1 lg:sticky lg:top-6 lg:self-start">
        <UsefulLinks />
      </aside>
    </div>
  )
}

/** Prominent, unmissable notice that only CYN-tagged games are counted. */
export function TagNotice() {
  return (
    <div className="rounded-xl border border-gold/40 bg-gold/10 px-5 py-4 text-center">
      <p className="font-display text-base font-bold uppercase tracking-wide text-gold-light sm:text-lg">
        Only games played with the [{CLAN_TAG}] tag are counted
      </p>
      <p className="mt-1 text-sm text-slate-300">
        Every game is checked individually - wins played under no tag or a different tag are{' '}
        <span className="font-semibold text-white">not</span> included.
      </p>
    </div>
  )
}

/** Shown instead of stats until the visitor registers. */
export function RegistrationGate() {
  return (
    <div className="grid gap-8 lg:grid-cols-[300px_minmax(0,1fr)_300px] lg:gap-10">
      <div className="panel order-1 mx-auto flex w-full max-w-3xl flex-col items-center justify-center bg-grid-fade px-6 py-16 text-center lg:order-none lg:col-start-2 lg:row-start-1">
        <CynLogo className="h-20 w-20 drop-shadow-[0_0_16px_rgba(139,92,246,0.4)]" />
        <h1 className="mt-4 font-display text-2xl font-bold text-white">Members only - one quick step</h1>
        <p className="mx-auto mt-2 max-w-md text-slate-400">
          Register with Discord and enter your in-game name, timezone and OpenFront public id to unlock
          the [{CLAN_TAG}] roster and stats.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link
            to="/register"
            className="inline-flex items-center gap-2 rounded-lg bg-[#5865F2] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#4752c4]"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.317 4.369A19.79 19.79 0 0 0 15.885 3c-.213.38-.462.893-.634 1.301a18.27 18.27 0 0 0-5.5 0A12.6 12.6 0 0 0 9.115 3a19.74 19.74 0 0 0-4.435 1.371C1.4 9.043.65 13.6.925 18.096a19.9 19.9 0 0 0 6.06 3.06c.49-.665.926-1.372 1.302-2.115a12.9 12.9 0 0 1-2.049-.98c.172-.125.34-.256.503-.392a14.19 14.19 0 0 0 12.516 0c.166.14.334.27.503.392-.65.385-1.336.71-2.052.982.377.742.812 1.45 1.303 2.114a19.83 19.83 0 0 0 6.064-3.06c.323-5.218-.552-9.735-2.758-13.727ZM8.68 15.331c-1.017 0-1.85-.933-1.85-2.081 0-1.148.815-2.082 1.85-2.082 1.044 0 1.867.943 1.85 2.082 0 1.148-.815 2.081-1.85 2.081Zm6.646 0c-1.017 0-1.85-.933-1.85-2.081 0-1.148.815-2.082 1.85-2.082 1.044 0 1.867.943 1.85 2.082 0 1.148-.806 2.081-1.85 2.081Z" />
            </svg>
            Register
          </Link>
          <a href={DISCORD_INVITE} target="_blank" rel="noreferrer" className="btn-ghost">
            Join the Discord
          </a>
        </div>
      </div>
      <aside className="order-2 lg:order-none lg:col-start-1 lg:row-start-1 lg:sticky lg:top-6 lg:self-start">
        <DiscordWidget />
      </aside>
    </div>
  )
}
