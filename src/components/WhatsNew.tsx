import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CHANGELOG, type SlideVisual } from '../data/changelog'
import { Emoji } from './Emoji'
import { winsRoleGradient } from '../lib/badges'
import { winRateClass } from '../lib/gameRows'
import { REACTION_EMOJIS } from '../lib/reactions'
import RoleFrame from './RoleFrame'
import { RoleName } from './RoleName'
import { CurrencyIcon } from './CurrencyIcon'
import { useLanguage } from '../i18n/LanguageContext'
import { WHATS_NEW_AFTER_UPDATE_KEY } from '../lib/useSiteUpdate'

const SEEN_KEY = 'cyn:seen-update'
export const OPEN_WHATS_NEW_EVENT = 'cyn:open-whatsnew'

function readSeen(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY)
  } catch {
    return null
  }
}

// ── the pictures: small mock-ups of the features ─────────────────────────────

const pill = 'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-300'

/** The new look as a whole: header with the search bar and matching buttons, the menu with the purple outlines, a table with coloured names. */
function SiteVisual({ de }: { de: boolean }) {
  const nav = de ? ['Übersicht', 'Monatlich', 'Ranked', 'Speedrun', 'Events'] : ['Overview', 'Monthly', 'Ranked', 'Speedrun', 'Events']
  const btn = 'flex h-7 items-center rounded-md border px-2 text-[10px] font-semibold'
  const rows: [string, number, number][] = [
    ['Calos', 307, 97],
    ['Chuma', 223, 78],
    ['Icey', 210, 0],
  ]
  return (
    <div className="w-full max-w-md space-y-1.5 rounded-xl border border-base-700 bg-base-950/90 p-2.5 shadow-xl">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-display text-xs font-bold text-white">CynClan.com</span>
          <span className="hidden rounded-md border border-base-600 bg-base-800 px-2 py-1 text-[9px] text-slate-500 min-[420px]:inline">{de ? 'Profil suchen…' : 'Find a profile…'}</span>
        </div>
        <div className="flex gap-1">
          <span className={`${btn} border-base-600 bg-base-800 text-slate-200`}>DE</span>
          <span className={`${btn} border-gold/60 bg-base-800 text-gold-light shadow-[0_0_8px_rgba(216,185,106,0.35)]`}>Metrics</span>
          <span className={`${btn} border-base-600 bg-base-800 text-slate-200`}>Zilka ▾</span>
        </div>
      </div>
      <div className="flex flex-wrap justify-center gap-1">
        {nav.map((n, i) => (
          <span key={n} className={`rounded-md border border-accent/40 px-2 py-1 text-[10px] font-medium ${i === 1 ? 'bg-accent/15 text-accent-light' : 'bg-base-800/60 text-slate-300'}`}>
            {n}
          </span>
        ))}
      </div>
      <div className="overflow-hidden rounded-lg border border-base-700">
        {rows.map(([name, wins, wr], i) => {
          const c = winsRoleGradient(wins) ?? ['#fff', '#fff']
          return (
            <div key={name} className="flex items-center gap-2 border-b border-base-700/60 px-2 py-1 text-[10px] last:border-0">
              <span className="w-3 font-display font-bold text-slate-500">{i + 1}</span>
              <span className="role-name flex-1 font-bold" style={{ '--c1': c[0], '--c2': c[1] } as CSSProperties}>
                {name}
              </span>
              <span className="tabular-nums text-slate-400">{wins}</span>
              <span className={`w-9 text-right tabular-nums ${winRateClass(wr)}`}>{wr}%</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** A profile page: banner and icon in the frame of the wins role, name with the channel icons, like, comment. */
function ProfileVisual({ de }: { de: boolean }) {
  return (
    <div className="w-full max-w-sm px-3 py-3">
      <RoleFrame wins={620} radius="0.9rem" width={3} variant="banner" plain="border border-base-700 bg-base-900">
        <div className="bg-base-900">
          <div className="h-20 bg-gradient-to-br from-accent/50 via-base-800 to-gold/30" />
          <div className="flex items-end gap-3 px-3 pb-3">
            <RoleFrame wins={620} radius="0.8rem" width={3} className="-mt-8 h-16 w-16 shrink-0" plain="border-2 border-base-900 bg-base-800">
              <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-accent/60 to-base-800 font-display text-2xl font-bold text-white">Z</span>
            </RoleFrame>
            <div className="min-w-0 flex-1 pt-2">
              <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-gold">[CYN] {de ? 'Mitglied' : 'member'}</p>
              <p className="flex items-center gap-1.5 font-display text-lg font-bold text-white">
                <RoleName wins={620}>Zilka</RoleName>
                <span className="inline-flex h-5 w-5 items-center justify-center rounded border border-base-600 bg-base-800 text-[10px] text-[#ff0000]">▶</span>
                <span className="inline-flex h-5 w-5 items-center justify-center rounded border border-base-600 bg-base-800 text-[10px] text-[#9146ff]">◼</span>
              </p>
              <div className="mt-1 flex gap-1">
                <span className={pill}>♥ 12</span>
                <span className={pill}>💬 4</span>
              </div>
            </div>
          </div>
        </div>
      </RoleFrame>
    </div>
  )
}

/** Donations: the top donors with caps and plutonium, a donation quest, the bell. */
function DonorsVisual({ de }: { de: boolean }) {
  const row = (rank: string, name: string, v: string, c: 'soft' | 'hard') => (
    <div className="flex items-center gap-2 border-b border-base-700/60 px-2.5 py-1.5 text-xs last:border-0">
      <span className="w-4 font-display font-bold text-slate-500">{rank}</span>
      <span className="flex-1 truncate font-medium text-slate-200">{name}</span>
      <span className="inline-flex items-center gap-1 font-display font-bold tabular-nums text-gold-light">
        {v} <CurrencyIcon currency={c} className="h-3.5 w-3.5" />
      </span>
    </div>
  )
  return (
    <div className="w-full max-w-sm space-y-2">
      <div className="overflow-hidden rounded-xl border border-base-700 bg-base-900/90">
        {row('1', 'Calos', '48,200', 'soft')}
        {row('2', 'Chuma', '31,900', 'soft')}
        {row('3', 'Icey', '120', 'hard')}
      </div>
      <div className="flex items-center justify-between gap-2 rounded-xl border border-gold/40 bg-gold/10 px-3 py-2 text-xs">
        <span className="text-slate-200">{de ? 'Quest: 10.000 Caps spenden' : 'Quest: donate 10,000 caps'}</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-base-950/70 px-2 py-0.5 font-semibold text-gold-light">
          <span aria-hidden>🔔</span> 1
        </span>
      </div>
    </div>
  )
}

function StripVisual({ de }: { de: boolean }) {
  return (
    <div className="w-full max-w-sm space-y-2">
      <div className="mx-auto flex w-max gap-0.5 rounded-full border border-base-600 bg-base-850 p-1 shadow-xl">
        {REACTION_EMOJIS.map((e) => (
          <span key={e} className="rounded-full p-1">
            <Emoji char={e} className="h-6 w-6" />
          </span>
        ))}
      </div>
      <div className="rounded-xl border border-base-700 bg-base-900/90 px-3 py-2.5">
        <p className="mb-2 flex items-center justify-between text-xs text-slate-400">
          <span className="font-semibold text-white">Zilka, Calos</span>
          <span className="font-semibold text-signal-green">victory</span>
        </p>
        <div className="flex flex-wrap items-center gap-1">
          <span className={`${pill} !text-accent-light`}>
            <Emoji char={REACTION_EMOJIS[1]} className="h-4 w-4" /> {de ? 'Gefällt mir' : 'Like'}
          </span>
          <span className={pill}>💬 3</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-accent/20 px-2 py-0.5 text-xs text-accent-light">
            <Emoji char={REACTION_EMOJIS[2]} className="h-3.5 w-3.5" /> 4
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-base-700/60 px-2 py-0.5 text-xs text-slate-300">
            <Emoji char={REACTION_EMOJIS[5]} className="h-3.5 w-3.5" /> 2
          </span>
          <span className="ml-auto flex gap-1">
            <span className={pill}>🔖</span>
            <span className={pill}>↗</span>
          </span>
        </div>
      </div>
    </div>
  )
}

function ReportVisual() {
  const row = (rank: string, name: string, v: string, cls = 'text-slate-200') => (
    <div className="flex items-center gap-2 border-b border-base-700/60 px-2.5 py-1.5 text-xs last:border-0">
      <span className="w-4 font-display font-bold text-slate-500">{rank}</span>
      <span className={`flex-1 truncate ${cls}`}>{name}</span>
      <span className="tabular-nums text-slate-400">{v}</span>
    </div>
  )
  const card = (tag: string, text: string, win: boolean) => (
    <div className={`rounded-lg border px-2 py-1.5 ${win ? 'border-signal-green/30 bg-signal-green/10' : 'border-signal-red/30 bg-signal-red/10'}`}>
      <p className="font-display text-[11px] font-bold text-white">[{tag}]</p>
      <p className={`text-[11px] font-semibold ${win ? 'text-signal-green' : 'text-signal-red'}`}>{text}</p>
    </div>
  )
  return (
    <div className="grid w-full max-w-md grid-cols-[1fr_88px] gap-2">
      <div className="overflow-hidden rounded-xl border border-base-700 bg-base-900/90">
        {row('1', 'Team 1 [CYN] 🏆', '24.1%', 'font-semibold text-white')}
        {row('·', '   Zilka', '12.3%', 'text-accent-light')}
        {row('·', '   Calos', '11.8%', 'text-accent-light')}
        {row('2', 'Team 2 [UN]', '18.3%', 'font-semibold text-white')}
        {row('3', 'Franquito', '9.1%')}
      </div>
      <div className="space-y-1.5">
        {card('CYN', 'Win +1.22', true)}
        {card('UN', 'Loss -0.20', false)}
        {card('EU', 'Loss -0.04', false)}
      </div>
    </div>
  )
}

function ColorsVisual() {
  const names: [string, number][] = [
    ['Bronze', 60],
    ['Silver', 120],
    ['Gold Legionnaire', 300],
    ['Diamond Veteran', 520],
  ]
  return (
    <div className="w-full max-w-sm space-y-3">
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-xl border border-base-700 bg-base-900/90 px-4 py-3">
        {names.map(([n, wins]) => {
          const c = winsRoleGradient(wins) ?? ['#fff', '#fff']
          return (
            <span key={n} className="px-1 text-sm font-bold" style={{ '--c1': c[0], '--c2': c[1] } as CSSProperties}>
              <RoleName wins={wins}>{n}</RoleName>
            </span>
          )
        })}
      </div>
      <div className="flex justify-between rounded-xl border border-base-700 bg-base-900/90 px-4 py-3 text-sm tabular-nums">
        {[0, 45, 62, 80, 100].map((p) => (
          <span key={p} className={winRateClass(p)}>
            {p}%
          </span>
        ))}
      </div>
    </div>
  )
}

function EventVisual({ de }: { de: boolean }) {
  return (
    <div className="relative w-full max-w-sm overflow-hidden rounded-xl border border-gold/40 bg-base-950">
      <img src="/events/cyn-hero-team.webp" alt="" className="h-36 w-full object-cover" />
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-base-950 via-base-950/70 to-transparent px-3 pb-2 pt-8">
        <p className="font-display text-lg font-bold text-gold-light">CYN HERO</p>
        <p className="text-xs text-slate-300">{de ? 'Nur 3x auf der Welt' : 'Only 3 in the world'}</p>
      </div>
    </div>
  )
}

function Visual({ kind, de }: { kind: SlideVisual; de: boolean }): ReactNode {
  if (kind === 'site') return <SiteVisual de={de} />
  if (kind === 'profile') return <ProfileVisual de={de} />
  if (kind === 'donors') return <DonorsVisual de={de} />
  if (kind === 'strip') return <StripVisual de={de} />
  if (kind === 'report') return <ReportVisual />
  if (kind === 'colors') return <ColorsVisual />
  return <EventVisual de={de} />
}

// ── the window ───────────────────────────────────────────────────────────────

/**
 * Shown once per browser after an update: a few short slides (picture, headline, one sentence) and a last page with the small things as
 * chips. Not on the dev copy of the site (small changes there all the time); ?whatsnew=1 previews it anywhere.
 */
export default function WhatsNew() {
  const { language } = useLanguage()
  const de = language === 'de'
  const latest = CHANGELOG[0]
  const isDevSite = /^(dev\.|cynosure-dev\.)/.test(window.location.hostname)
  const preview = new URLSearchParams(window.location.search).has('whatsnew')
  const [open, setOpen] = useState(false)
  const [i, setI] = useState(0)

  useEffect(() => {
    if (!latest) return
    // clicking the Update button opens it after the reload (also on the dev copy), once per click and only for the newest entry
    let afterUpdate = false
    try {
      afterUpdate = sessionStorage.getItem(WHATS_NEW_AFTER_UPDATE_KEY) === '1'
      sessionStorage.removeItem(WHATS_NEW_AFTER_UPDATE_KEY)
    } catch {
      /* blocked storage */
    }
    if (preview || (afterUpdate && (isDevSite || readSeen() !== latest.id)) || (!isDevSite && readSeen() !== latest.id)) setOpen(true)
  }, [latest, isDevSite, preview])

  // the "What's new" button in the header opens it again any time (e.g. after it was clicked away by accident)
  useEffect(() => {
    const show = () => {
      setI(0)
      setOpen(true)
    }
    window.addEventListener(OPEN_WHATS_NEW_EVENT, show)
    return () => window.removeEventListener(OPEN_WHATS_NEW_EVENT, show)
  }, [])

  const last = latest ? latest.slides.length : 0 // the page of chips comes after the slides
  const close = useCallback(() => {
    setOpen(false)
    try {
      if (latest && !preview) localStorage.setItem(SEEN_KEY, latest.id) // a preview does not count as seen
    } catch {
      /* private window: it just shows again next time */
    }
  }, [latest, preview])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      else if (e.key === 'ArrowRight') setI((n) => Math.min(n + 1, last))
      else if (e.key === 'ArrowLeft') setI((n) => Math.max(n - 1, 0))
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, close, last])

  if (!open || !latest) return null
  const L = (x: { de: string; en: string }) => (de ? x.de : x.en)
  const slide = i < last ? latest.slides[i] : null

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" onClick={close} role="dialog" aria-modal="true" aria-label={de ? 'Das ist neu' : 'What is new'}>
      <div className="w-full max-w-lg overflow-hidden md:max-w-3xl rounded-2xl border border-accent/40 bg-base-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* header: tag, date, one line of what it is about */}
        <div className="flex items-start justify-between gap-3 px-5 pt-4 md:px-8 md:pt-6">
          <div>
            <span className="rounded-full bg-accent px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white">{de ? 'Neu' : 'New'}</span>
            <span className="ml-2 text-xs text-slate-500">{new Date(latest.date).toLocaleDateString(de ? 'de-DE' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
            <p className="mt-1.5 text-sm text-slate-300 md:text-lg">{L(latest.tldr)}</p>
          </div>
          <button type="button" onClick={close} className="rounded-md px-2 py-1 text-slate-400 hover:bg-base-800 hover:text-white" aria-label={de ? 'Schließen' : 'Close'}>
            ✕
          </button>
        </div>

        {slide ? (
          <div key={i} className="animate-[fadeUp_.3s_ease]">
            {/* the picture */}
            <div className="relative mt-4 flex h-52 items-center justify-center md:h-[24rem] bg-gradient-to-br from-accent/25 via-base-850 to-gold/15 px-5">
              <span className="absolute left-4 top-3 rounded-full border border-gold/50 bg-base-950/70 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-gold-light">{L(slide.tag)}</span>
              <div className="flex w-full justify-center md:origin-center md:scale-[1.6]">
                <Visual kind={slide.visual} de={de} />
              </div>
            </div>
            <div className="px-5 pb-1 pt-4 text-center md:px-8 md:pt-6">
              <h2 className="font-display text-2xl font-bold text-white md:text-4xl">{L(slide.title)}</h2>
              <p className="mx-auto mt-1.5 max-w-sm text-sm text-slate-300 md:mt-2 md:max-w-xl md:text-lg">{L(slide.text)}</p>
              {slide.link && (
                <Link to={slide.link.to} onClick={close} className="mt-2 inline-block text-sm font-semibold md:text-base text-accent-light underline underline-offset-4 hover:text-accent">
                  {L(slide.link.label)} →
                </Link>
              )}
            </div>
          </div>
        ) : (
          <div key="more" className="animate-[fadeUp_.3s_ease] px-5 pb-1 pt-5 md:px-8 md:pt-8">
            <h2 className="text-center font-display text-2xl font-bold text-white md:text-4xl">{de ? 'Außerdem' : 'Also'}</h2>
            <div className="mt-4 flex flex-wrap justify-center gap-2 md:mt-6 md:gap-3">
              {latest.more.map((m) => (
                <span
                  key={m.text.en}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium md:px-4 md:py-2 md:text-base ${m.important ? 'border-gold/60 bg-gold/15 text-gold-light' : 'border-base-600 bg-base-800 text-slate-300'}`}
                >
                  {m.important && '⚠ '}
                  {L(m.text)}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* progress and buttons */}
        <div className="mt-5 flex items-center justify-between gap-3 border-t border-base-700 px-5 py-3 md:mt-7 md:px-8 md:py-4">
          <button type="button" onClick={() => setI((n) => Math.max(n - 1, 0))} disabled={i === 0} className="rounded-lg px-3 py-1.5 text-sm text-slate-400 hover:text-white disabled:invisible">
            {de ? 'Zurück' : 'Back'}
          </button>
          <div className="flex items-center gap-1.5" aria-hidden="true">
            {Array.from({ length: last + 1 }, (_, n) => (
              <button key={n} type="button" onClick={() => setI(n)} className={`h-2 rounded-full transition-all ${n === i ? 'w-6 bg-accent' : 'w-2 bg-base-600 hover:bg-base-500'}`} aria-label={String(n + 1)} />
            ))}
          </div>
          {i < last ? (
            <button type="button" onClick={() => setI((n) => n + 1)} className="btn-accent !px-5 !py-1.5 text-sm md:!px-7 md:!py-2 md:text-base">
              {de ? 'Weiter' : 'Next'}
            </button>
          ) : (
            <button type="button" onClick={close} className="btn-accent !px-5 !py-1.5 text-sm md:!px-7 md:!py-2 md:text-base">
              {de ? 'Los geht’s' : "Let's go"}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
