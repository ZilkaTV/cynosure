import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import CynLogo from './CynLogo'
import { CLAN_NAME, CLAN_TAG, DISCORD_INVITE } from '../config'
import { useProfile } from '../lib/useProfile'
import { useGameNightReminder } from '../lib/useGameNightReminder'
import { useSiteUpdate } from '../lib/useSiteUpdate'
import WhatsNew, { OPEN_WHATS_NEW_EVENT } from './WhatsNew'
import NotificationBell from './NotificationBell'
import { boostersReady, useBoosterState } from '../lib/boosters'
import { useQuestsReady } from '../lib/notifications'
import RoleFrame from './RoleFrame'
import { RoleName, useWinsIndex } from './RoleName'
import FitImage from './FitImage'
import { parseFit, profileImageSrc, useProfileExtras } from '../lib/profileExtras'
import { initialOf } from '../lib/displayName'
import { CHANGELOG } from '../data/changelog'
import { EVENTS } from '../data/events'
import ProfileSearch from './ProfileSearch'
import { useMemberRoles, type SiteRole } from '../lib/roles'
import { useQueueAlert } from '../lib/queueNotify'
import { clearLocalProfile } from '../lib/profiles'
import { supabase } from '../lib/supabase'
import { useIsAdmin } from '../lib/useSession'
import { useIsInnerCircle, logSiteVisit } from '../lib/metrics'
import { useLanguage } from '../i18n/LanguageContext'
import { useAccess, useSharedRoster, type Access } from '../lib/access'
import { titleForLevel, xpProgress } from '../lib/levels'
import { AccessExpired } from './AccessExpired'
import type { TranslationShape } from '../i18n/translations'

/**
 * A nav entry that opens a small menu. The panel is positioned with `fixed`
 * from the button's rectangle because the nav row scrolls horizontally on
 * small screens (overflow-x-auto), which would clip an absolutely positioned
 * panel.
 */
function NavDropdown({ label, shortLabel, items }: { label: string; shortLabel: string; items: { to: string; label: string }[] }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ left: 0, top: 0 })
  const wrapRef = useRef<HTMLSpanElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const { pathname } = useLocation()
  const active = items.some((i) => pathname === i.to || pathname.startsWith(i.to + '/'))

  useEffect(() => setOpen(false), [pathname])

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [open])

  const toggle = () => {
    if (!open && buttonRef.current) {
      const r = buttonRef.current.getBoundingClientRect()
      setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - 184)), top: r.bottom + 4 })
    }
    setOpen((o) => !o)
  }

  return (
    <span ref={wrapRef} className="inline-block">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`nav-link whitespace-nowrap !px-2.5 !py-2.5 !text-xs sm:!px-3 sm:!py-2 sm:!text-sm ${active ? 'nav-link-active' : ''}`}
      >
        <span className="sm:hidden">{shortLabel}</span>
        <span className="hidden sm:inline">{label}</span>
        <span aria-hidden="true" className="ml-1 text-[10px] opacity-70">
          {open ? '\u25B2' : '\u25BC'}
        </span>
      </button>
      {open && (
        <div role="menu" style={{ position: 'fixed', left: pos.left, top: pos.top }} className="z-50 w-44 overflow-hidden rounded-lg border border-base-600 bg-base-850 shadow-xl">
          {items.map((i) => (
            <Link key={i.to} to={i.to} role="menuitem" className="block px-4 py-2.5 text-sm text-slate-200 hover:bg-base-800">
              {i.label}
            </Link>
          ))}
        </div>
      )}
    </span>
  )
}

function navItems(t: TranslationShape) {
  return [
    { to: '/', label: t.nav.overview, shortLabel: t.nav.shortOverview, end: true, children: undefined as { to: string; label: string }[] | undefined },
    {
      to: '/monthly',
      label: t.nav.monthly,
      shortLabel: t.nav.shortMonthly,
      children: [
        { to: '/monthly/ffa', label: t.nav.monthlyFfa },
        { to: '/monthly/team', label: t.nav.monthlyTeam },
      ],
    },
    {
      to: '/ranked',
      label: 'Ranked',
      shortLabel: 'Ranked',
      children: [
        { to: '/ranked/1v1', label: '1v1' },
        { to: '/ranked/2v2', label: '2v2' },
        { to: '/ranked/ffa', label: 'FFA' },
      ],
    },
    { to: '/speedrun', label: t.nav.speedrun, shortLabel: t.nav.shortSpeedrun },
    { to: '/queue', label: t.nav.queue, shortLabel: t.nav.shortQueue },
    { to: '/history', label: t.nav.history, shortLabel: t.nav.shortHistory },
    { to: '/events', label: t.nav.events, shortLabel: t.nav.shortEvents },
    { to: '/quests', label: t.nav.quests, shortLabel: t.nav.shortQuests },
  ]
}

const DiscordIcon = ({ className = 'h-4 w-4' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M20.317 4.369A19.79 19.79 0 0 0 15.885 3c-.213.38-.462.893-.634 1.301a18.27 18.27 0 0 0-5.5 0A12.6 12.6 0 0 0 9.115 3a19.74 19.74 0 0 0-4.435 1.371C1.4 9.043.65 13.6.925 18.096a19.9 19.9 0 0 0 6.06 3.06c.49-.665.926-1.372 1.302-2.115a12.9 12.9 0 0 1-2.049-.98c.172-.125.34-.256.503-.392a14.19 14.19 0 0 0 12.516 0c.166.14.334.27.503.392-.65.385-1.336.71-2.052.982.377.742.812 1.45 1.303 2.114a19.83 19.83 0 0 0 6.064-3.06c.323-5.218-.552-9.735-2.758-13.727ZM8.68 15.331c-1.017 0-1.85-.933-1.85-2.081 0-1.148.815-2.082 1.85-2.082 1.044 0 1.867.943 1.85 2.082 0 1.148-.815 2.081-1.85 2.081Zm6.646 0c-1.017 0-1.85-.933-1.85-2.081 0-1.148.815-2.082 1.85-2.082 1.044 0 1.867.943 1.85 2.082 0 1.148-.806 2.081-1.85 2.081Z" />
  </svg>
)

const HeartIcon = ({ className = 'h-5 w-5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 21s-6.7-4.35-9.3-8.1C.9 10.2 1.4 6.6 4.3 5 6.4 3.8 9 4.3 12 7c3-2.7 5.6-3.2 7.7-2 2.9 1.6 3.4 5.2 1.6 7.9C18.7 16.65 12 21 12 21Z" />
  </svg>
)

const ChartIcon = ({ className = 'h-4 w-4' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 3v18h18" />
    <path d="M18 17V9M13 17V5M8 17v-4" />
  </svg>
)

const CalendarIcon = ({ className = 'h-4 w-4' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </svg>
)

const menuIcon = 'h-4 w-4 shrink-0'
const MenuIcon = ({ children }: { children: ReactNode }) => (
  <svg className={menuIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
)
const UserIcon = () => (
  <MenuIcon>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
  </MenuIcon>
)
const BookmarkIcon = () => (
  <MenuIcon>
    <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z" />
  </MenuIcon>
)
const CardIcon = () => (
  <MenuIcon>
    <path d="M8 3h8l4 4v11l-3 3H7l-3-3V7z" />
    <path d="M9 13h6M9 17h6M12 7v3" />
  </MenuIcon>
)
const CollectionIcon = () => (
  <MenuIcon>
    <rect x="3" y="6" width="12" height="15" rx="2" />
    <path d="M7 3h11a2 2 0 0 1 2 2v12" />
  </MenuIcon>
)
const SettingsIcon = () => (
  <MenuIcon>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
  </MenuIcon>
)
const FlagIcon = () => (
  <MenuIcon>
    <path d="M5 21V4M5 4h12l-2 4 2 4H5" />
  </MenuIcon>
)
const ArchiveIcon = () => (
  <MenuIcon>
    <rect x="3" y="4" width="18" height="4" rx="1" />
    <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4" />
  </MenuIcon>
)
const SignOutIcon = () => (
  <MenuIcon>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
  </MenuIcon>
)

const RefreshIcon = ({ className = 'h-4 w-4' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12a9 9 0 1 1-3-6.7" />
    <path d="M21 3v6h-6" />
  </svg>
)

/** The small line under the member's name: days of access left, "permanent" or "expired" (null while unknown). */
function accessLabel(a: Access, language: string): { text: string; cls: string } | null {
  const de = language === 'de'
  if (a.status === 'permanent') return { text: de ? '∞ dauerhaft' : '∞ permanent', cls: 'text-gold-light' }
  if (a.status === 'expired') return { text: de ? 'abgelaufen' : 'expired', cls: 'text-signal-red' }
  if (a.status !== 'ok' || a.daysLeft == null) return null
  const d = a.daysLeft
  const text = de ? (d === 1 ? '1 Tag' : `${d} Tage`) : d === 1 ? '1 day' : `${d} days`
  return { text, cls: d <= 1 ? 'text-warn' : d <= 2 ? 'text-signal-red' : d <= 4 ? 'text-amber-400' : 'text-slate-400' }
}

function AccountMenu({ isInner }: { isInner: boolean }) {
  const { profile, refresh } = useProfile()
  const { t, language } = useLanguage()
  const isAdmin = useIsAdmin()
  const access = useAccess()
  const label = accessLabel(access, language)
  // Level and XP bar above the name (from the quest XP of the signed-in member).
  const roster = useSharedRoster()
  const xp = roster?.members.find((m) => m.publicId === profile?.openfront_id)?.xp
  const lvl = xp == null ? null : xpProgress(xp)
  const roles = useMemberRoles(profile?.openfront_id, profile?.in_game_name, isInner)
  const roleLabel = (r: SiteRole) =>
    r === 'inner' ? 'Inner Circle' : r === 'captain' ? t.events.captain : r === 'leader' ? t.clanPage.roleLeader : r === 'officer' ? t.clanPage.roleOfficer : t.clanPage.roleMember
  const rolesText = roles.map(roleLabel).join(' · ')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { extras } = useProfileExtras(profile?.openfront_id)
  const myWins = useWinsIndex().byId.get(profile?.openfront_id ?? '')

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
        <span className="hidden sm:inline">{t.nav.register}</span>
      </Link>
    )
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="top-btn !w-auto justify-start !px-3"
        aria-label={t.accountMenu.ariaLabel}
      >
        {/* the member's own icon (or the first letter of the name; a clan tag in front is ignored) instead of the gear */}
        <RoleFrame wins={myWins} radius="0.6rem" width={2} className="h-9 w-9 shrink-0" plain="border border-base-600 bg-base-800">
          {profileImageSrc(extras?.avatar_url) ? (
            <FitImage src={profileImageSrc(extras?.avatar_url)!} fit={parseFit(extras?.avatar_fit)} />
          ) : (
            <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-accent/50 to-base-800 font-display text-lg font-bold text-white">{initialOf(profile.in_game_name)}</span>
          )}
        </RoleFrame>
        <span className="hidden min-w-0 flex-col items-start leading-tight sm:flex">
          {lvl && (
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-gold-light">
              {t.questCard.lvlPrefix} {lvl.level} · {titleForLevel(lvl.level)}
              {lvl.next != null && (
                <span className="h-2.5 w-24 overflow-hidden rounded-full border border-white/80 bg-base-700">
                  <span className="block h-full rounded-full bg-gradient-to-r from-accent to-gold" style={{ width: `${Math.min(100, (lvl.into / lvl.span) * 100)}%` }} />
                </span>
              )}
            </span>
          )}
          <span className="max-w-[8rem] truncate">
            <RoleName wins={myWins}>{profile.in_game_name}</RoleName>
          </span>
          <span className="max-w-[10rem] truncate text-[10px] font-medium text-slate-400">{rolesText}</span>
          {label && <span className={`text-[10px] font-semibold ${label.cls}`}>{label.text}</span>}
        </span>
        {lvl && <span className="text-[11px] font-semibold text-gold-light sm:hidden">{t.questCard.lvlPrefix} {lvl.level}</span>}
        {isAdmin && <span className="rounded-full bg-gold/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gold-light">{t.accountMenu.adminBadge}</span>}
        <svg viewBox="0 0 20 20" fill="currentColor" className={`ml-auto h-5 w-5 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-lg border border-base-600 bg-base-850 shadow-xl">
          <div className="border-b border-base-700 px-4 py-2.5 sm:hidden">
            <p className="truncate text-sm font-semibold text-white">{profile.in_game_name}</p>
            {lvl && <p className="text-[11px] font-semibold text-gold-light">{t.questCard.lvlPrefix} {lvl.level} · {titleForLevel(lvl.level)}</p>}
            {rolesText && <p className="text-[11px] text-slate-400">{rolesText}</p>}
            {label && <p className={`text-[11px] font-semibold ${label.cls}`}>{label.text}</p>}
          </div>
          <Link to={`/member/${profile.openfront_id}`} onClick={() => setOpen(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-200 hover:bg-base-800">
            <UserIcon />
            {t.accountMenu.myProfile}
          </Link>
          <Link to={`/member/${profile.openfront_id}#saved`} onClick={() => setOpen(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-200 hover:bg-base-800">
            <BookmarkIcon />
            {t.accountMenu.savedGames}
          </Link>
          <Link to="/card" onClick={() => setOpen(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-200 hover:bg-base-800">
            <CardIcon />
            {language === 'de' ? 'Meine Karte' : 'My card'}
          </Link>
          <Link to="/collection" onClick={() => setOpen(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-200 hover:bg-base-800">
            <CollectionIcon />
            {language === 'de' ? 'Sammlung & Booster' : 'Collection & boosters'}
          </Link>
          {isInner && (
            <Link to="/game-nights" onClick={() => setOpen(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gold-light hover:bg-base-800">
              <CalendarIcon />
              <span className="flex flex-col leading-tight">
                {t.home.gameNightsTitle}
                <span className="text-[9px] font-normal uppercase tracking-wide text-gold/80">{language === 'de' ? 'Nur Inner Circle' : 'Inner circle only'}</span>
              </span>
            </Link>
          )}
          <Link to="/register" onClick={() => setOpen(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-200 hover:bg-base-800">
            <SettingsIcon />
            {t.accountMenu.settings}
          </Link>
          {isAdmin && (
            <Link to="/reports" onClick={() => setOpen(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-200 hover:bg-base-800">
              <FlagIcon />
              {language === 'de' ? 'Meldungen' : 'Reports'}
            </Link>
          )}
          {isAdmin && (
            <Link to="/archive" onClick={() => setOpen(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-200 hover:bg-base-800">
              <ArchiveIcon />
              {language === 'de' ? 'Archiviert' : 'Archived'}
            </Link>
          )}
          <button
            onClick={async () => {
              setOpen(false)
              clearLocalProfile()
              if (supabase) await supabase.auth.signOut()
              refresh()
            }}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-signal-red hover:bg-base-800"
          >
            <SignOutIcon />
            {t.accountMenu.signOut}
          </button>
        </div>
      )}
    </div>
  )
}

/** The Booster button: glows in gold while a booster can be opened (the free one of the day or one on hand). */
function BoosterButton() {
  const { language } = useLanguage()
  const de = language === 'de'
  const state = useBoosterState()
  const ready = boostersReady(state)
  const title = ready > 0 ? (de ? `${ready} Booster bereit: öffnen` : `${ready} booster(s) ready: open`) : de ? 'Sammlung und Booster' : 'Collection and boosters'
  return (
    <Link
      to="/collection"
      title={title}
      aria-label={title}
      className={`relative inline-flex h-10 items-center gap-2 rounded-lg border border-base-600 bg-base-800/60 px-3 text-sm font-semibold text-slate-200 transition-colors hover:border-accent hover:text-white ${ready > 0 ? 'glow-ready' : ''}`}
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
        <rect x="5" y="3" width="14" height="18" rx="2" />
        <path d="M9 8h6M9 12h6M12 16h.01" />
      </svg>
      <span className="hidden sm:inline">Booster</span>
      {ready > 0 && <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-gold px-1 text-[11px] font-bold text-base-950 ring-2 ring-base-900">{ready}</span>}
    </Link>
  )
}

export default function Layout({ children }: { children: ReactNode }) {
  // The dev copy of the site (dev.cynclan.com / cynosure-dev.*.workers.dev) shows an orange bar and a test sign-in.
  const isDevSite = /^(dev\.|cynosure-dev\.)/.test(window.location.hostname)
  const { t, language } = useLanguage()
  const { profile } = useProfile()
  const access = useAccess()
  useGameNightReminder()
  const siteUpdate = useSiteUpdate()
  const queueUnseen = useQueueAlert()
  const isInnerCircle = useIsInnerCircle()
  const liveEvent = EVENTS.some((e) => e.status === 'live')
  const questsReady = useQuestsReady()
  const innerOnly = language === 'de' ? 'Nur Inner Circle' : 'Inner circle only'
  const navRef = useRef<HTMLElement>(null)
  const { pathname } = useLocation()

  // A tab left in the background for a while shows old data (and possibly an old version of the site). Coming back after
  // 10+ minutes reloads it once - unless something is being typed or the page is a form page.
  useEffect(() => {
    let hiddenAt: number | null = document.visibilityState === 'hidden' ? Date.now() : null
    const onChange = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now()
        return
      }
      const away = hiddenAt ? Date.now() - hiddenAt : 0
      hiddenAt = null
      if (away < 10 * 60_000) return
      if (['/register', '/planner', '/survey', '/events'].some((p) => window.location.pathname.startsWith(p))) return
      const typing = [...document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input[type=text], input[type=search], textarea')].some((el) => el.value.trim().length > 0)
      if (!typing) window.location.reload()
    }
    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  }, [])

  // On a phone the menu scrolls sideways: bring the current page's entry into view.
  useEffect(() => {
    const nav = navRef.current
    const active = nav?.querySelector<HTMLElement>('.nav-link-active')
    if (!nav || !active) return
    nav.scrollTo({ left: Math.max(0, active.offsetLeft - nav.clientWidth / 2 + active.offsetWidth / 2), behavior: 'auto' })
  }, [pathname])

  useEffect(() => {
    logSiteVisit(!!profile, profile?.openfront_id)
    // Only ever needs to fire once per tab session (logSiteVisit's own
    // sessionStorage guard enforces that) - re-running on later profile
    // changes would just be a no-op, so no dependency on profile here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="min-h-screen">
      {isDevSite && (
        <div className="sticky top-0 z-[100] bg-amber-500 px-3 py-1.5 text-center text-xs font-bold text-black">DEV website</div>
      )}
      <WhatsNew />
      <header className="relative border-b border-base-700 bg-base-950/60">
        {/* top-right account menu + language switcher - floated so the crest stays centred */}
        <div className="flex w-full flex-wrap items-center justify-between gap-x-2 gap-y-1 px-3 pt-1.5 sm:min-h-[5.75rem] sm:items-start sm:justify-end sm:px-3 2xl:min-h-[9rem]">
          <div className="flex shrink-0 flex-col items-start gap-1.5 sm:absolute sm:left-3 sm:top-1.5 sm:z-10">
            <div className="flex items-center gap-4">
              <Link to="/" className="shrink-0 font-display text-base font-bold tracking-wide text-slate-200 transition-colors hover:text-white sm:text-2xl lg:text-3xl">
                CynClan.com
              </Link>
              <ProfileSearch className="hidden w-60 xl:block" />
            </div>
            <div className="hidden items-center gap-1.5 sm:flex">
              <button
                type="button"
                onClick={siteUpdate.apply}
                disabled={!siteUpdate.available}
                title={siteUpdate.available ? t.ui.siteUpdateAvailable : t.ui.siteUpToDate}
                aria-label={siteUpdate.available ? t.ui.siteUpdateAvailable : t.ui.siteUpToDate}
                className={`top-btn-sm ${siteUpdate.available ? '' : 'cursor-not-allowed opacity-40'}`}
              >
                <RefreshIcon className="h-4 w-4" />
                {t.ui.siteUpdate}
                {siteUpdate.available && (
                  <span className="absolute -right-1 -top-1 h-3 w-3 animate-pulse rounded-full bg-red-500 ring-2 ring-base-900" aria-hidden />
                )}
              </button>
              {CHANGELOG.length > 0 && (
                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new Event(OPEN_WHATS_NEW_EVENT))}
                  title={language === 'de' ? 'Zeigt die Neuerungen noch einmal' : 'Shows the news again'}
                  className="top-btn-sm"
                >
                  {language === 'de' ? 'Was ist neu?' : "What's new?"}
                </button>
              )}
            </div>
          </div>
          <div className="relative flex flex-col items-end gap-1.5">
          <div className="flex items-center gap-1.5 sm:gap-2">
            {isInnerCircle && (
              <Link to="/metrics" className="top-btn top-btn-inner" aria-label={t.metrics.navLabel}>
                <ChartIcon />
                <span className="hidden flex-col items-center leading-tight sm:flex">
                  {t.metrics.navLabel}
                  <span className="text-[9px] font-normal uppercase tracking-wide text-gold/80">{innerOnly}</span>
                </span>
              </Link>
            )}
            <AccountMenu isInner={isInnerCircle} />
          </div>
          {profile && (
            <div className="flex items-center gap-2 sm:absolute sm:right-0 sm:top-full sm:z-20 sm:mt-1.5">
              <BoosterButton />
              <NotificationBell />
            </div>
          )}
          </div>
        </div>

        {/* below the wide layout the profile search gets its own row */}
        <div className="flex items-center gap-1.5 px-3 pb-1 pt-1.5 sm:px-4 xl:hidden">
          <ProfileSearch className="w-full min-w-0 flex-1 sm:max-w-xs sm:flex-none" />
          <div className="flex shrink-0 items-center gap-1.5 sm:hidden">
            <button
              type="button"
              onClick={siteUpdate.apply}
              disabled={!siteUpdate.available}
              aria-label={siteUpdate.available ? t.ui.siteUpdateAvailable : t.ui.siteUpToDate}
              className={`top-btn-sm !w-10 !px-0 ${siteUpdate.available ? '' : 'cursor-not-allowed opacity-40'}`}
            >
              <RefreshIcon className="h-4 w-4" />
              {siteUpdate.available && <span className="absolute -right-1 -top-1 h-3 w-3 animate-pulse rounded-full bg-red-500 ring-2 ring-base-900" aria-hidden />}
            </button>
            {CHANGELOG.length > 0 && (
              <button type="button" onClick={() => window.dispatchEvent(new Event(OPEN_WHATS_NEW_EVENT))} aria-label={language === 'de' ? 'Was ist neu?' : "What's new?"} className="top-btn-sm !w-10 !px-0 text-base">
                ?
              </button>
            )}
          </div>
        </div>

        {/* centred crest - always links home */}
        <Link to="/" className="mt-0.5 flex flex-row items-center justify-center gap-2 px-4 pb-0.5 sm:mt-0 sm:flex-col sm:gap-1 sm:pb-1 2xl:absolute 2xl:left-1/2 2xl:top-2 2xl:z-10 2xl:w-max 2xl:-translate-x-1/2 2xl:p-0" aria-label={`${CLAN_NAME} ${t.nav.homeAria}`}>
          <span className="crest-glow">
            <CynLogo className="h-10 w-10 drop-shadow-[0_0_14px_rgba(139,92,246,0.5)] sm:h-20 sm:w-20 sm:drop-shadow-[0_0_16px_rgba(139,92,246,0.5)] 2xl:h-24 2xl:w-24" />
          </span>
          <span className="text-center font-display text-base font-bold tracking-[0.08em] text-white sm:text-2xl sm:tracking-[0.25em]">
            [{CLAN_TAG}] <span className="text-gold">{CLAN_NAME.toUpperCase()}</span>
          </span>
        </Link>

        {/* sub navigation - centred */}
        <nav ref={navRef} className="mx-auto flex max-w-7xl items-center justify-start gap-0.5 overflow-x-auto px-2 pb-2 pt-1 sm:justify-center sm:gap-1 sm:px-6 sm:pb-1.5">
          {navItems(t).map((n) =>
            n.children ? (
              <NavDropdown key={n.to} label={n.label} shortLabel={n.shortLabel} items={n.children} />
            ) : (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  `nav-link whitespace-nowrap !px-2.5 !py-2.5 !text-xs sm:!px-3 sm:!py-2 sm:!text-sm ${isActive ? 'nav-link-active' : ''} ${n.to === '/quests' && questsReady > 0 ? 'glow-ready' : ''}`
                }
              >
                <span className="sm:hidden">{n.shortLabel}</span>
                <span className="hidden sm:inline">{n.label}</span>
                {n.to === '/events' && liveEvent && (
                  <span className="ml-1.5 inline-block animate-pulse rounded-full bg-signal-green/20 px-1.5 py-0.5 align-middle text-[10px] font-bold uppercase tracking-wide text-signal-green">
                    {language === 'de' ? 'Aktiv' : 'Active'}
                  </span>
                )}
                {n.to === '/quests' && questsReady > 0 && (
                  <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-gold px-1 align-middle text-[10px] font-bold text-base-950">{questsReady}</span>
                )}
                {n.to === '/queue' && queueUnseen > 0 && (
                  <span className="ml-1.5 inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-red-500 align-middle" aria-label={String(queueUnseen)} />
                )}
              </NavLink>
            ),
          )}
        </nav>
      </header>

      <main className="w-full px-3 py-5 sm:px-8 sm:py-8">
        {/* Pages title themselves with <h2> (SectionHeading) and the layout had no <h1> at all - screen readers and crawlers got a page with no top-level heading. */}
        <h1 className="sr-only">{CLAN_NAME}</h1>
        {access.status === 'expired' && !['/register', '/donate'].some((p) => pathname.startsWith(p)) ? <AccessExpired access={access} /> : children}
      </main>

      <footer className="mt-16 border-t border-base-700 pb-24 pt-8 text-center text-sm text-slate-500 sm:pb-8">
        <p>
          [{CLAN_TAG}] {CLAN_NAME} · {t.footer.clanDescriptor} ·{' '}
          <a href={DISCORD_INVITE} target="_blank" rel="noreferrer" className="text-accent-light hover:text-accent">
            {t.footer.discord}
          </a>
        </p>
        <p className="mt-1 text-xs text-slate-600">{t.footer.statsNotice(CLAN_TAG)}</p>
        <p className="mt-1 text-xs text-slate-600">
          {t.footer.badgeIconsCredit}{' '}
          <a href="https://game-icons.net" target="_blank" rel="noreferrer" className="underline hover:text-slate-400">
            game-icons.net
          </a>{' '}
          (CC BY 3.0)
        </p>
      </footer>

      <Link
        to="/donate"
        aria-label={t.donate.buttonAria}
        className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-full bg-gold px-3 py-2.5 text-sm font-semibold sm:bottom-5 sm:left-5 sm:px-4 sm:py-3 text-base-950 shadow-lg shadow-gold/30 transition-transform hover:scale-105 hover:bg-gold-light"
      >
        <HeartIcon />
        <span className="hidden sm:inline">{t.donate.label}</span>
      </Link>

    </div>
  )
}
