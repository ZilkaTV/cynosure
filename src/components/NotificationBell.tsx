import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLanguage } from '../i18n/LanguageContext'
import { useSharedRoster } from '../lib/access'
import { cleanDisplayName } from '../lib/displayName'
import { QUESTS } from '../lib/quests'
import { SOUND_KEY, soundEnabled, useNotifications, type Notice } from '../lib/notifications'
import { setTabBadge } from '../lib/tabBadge'
import { relativeTime } from './ui'
import { RoleName, useWinsIndex } from './RoleName'
import type { ReactNode } from 'react'

/** A short two-note chime for a new notification (silent when the browser does not allow sound yet). */
function chime() {
  try {
    const ac = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    const now = ac.currentTime
    ;[659.25, 880].forEach((freq, i) => {
      const osc = ac.createOscillator()
      const gain = ac.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, now + i * 0.13)
      gain.gain.linearRampToValueAtTime(0.14, now + i * 0.13 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.13 + 0.4)
      osc.connect(gain).connect(ac.destination)
      osc.start(now + i * 0.13)
      osc.stop(now + i * 0.13 + 0.45)
    })
  } catch {
    /* no audio */
  }
}

const ICON: Record<Notice['kind'], string> = {
  game_reaction: '❤️',
  comment_reaction: '👍',
  game_comment: '💬',
  comment_reply: '↩️',
  profile_like: '💜',
  profile_comment: '📝',
  quest: '🎯',
  report: '⚑',
}

/** The bell under the account button: a number for what is new, a list on click (like the notifications on Facebook). */
export default function NotificationBell() {
  const { t, language } = useLanguage()
  const de = language === 'de'
  const roster = useSharedRoster()
  const { notices, unread, isUnread, markSeen, reload, loaded } = useNotifications()
  const [sound, setSound] = useState(soundEnabled)
  const previous = useRef<number | null>(null)
  const [open, setOpen] = useState(false)
  // what was new when the list was opened stays marked while it is open, even though the number goes away at once
  const [newAtOpen, setNewAtOpen] = useState<Set<string>>(new Set())
  const box = useRef<HTMLDivElement>(null)
  const names = useMemo(() => new Map((roster?.members ?? []).map((m) => [m.publicId, m.name] as const)), [roster])
  const wins = useWinsIndex()
  const nameOf = (id?: string) => cleanDisplayName((id && names.get(id)) || id || '?')

  // the number on the browser tab, and a chime when something new arrives (not for what was already there at the start)
  useEffect(() => {
    setTabBadge(unread)
    return () => setTabBadge(0)
  }, [unread])
  useEffect(() => {
    if (!loaded) return
    if (previous.current != null && unread > previous.current && sound && !open) chime()
    previous.current = unread
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unread, loaded])
  function toggleSound() {
    const next = !sound
    setSound(next)
    try {
      localStorage.setItem(SOUND_KEY, next ? '1' : '0')
    } catch {
      /* ignore */
    }
    if (next) chime()
  }

  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', key)
    }
  }, [open])

  function toggle() {
    if (!open) {
      setNewAtOpen(new Set(notices.filter(isUnread).map((n) => n.id)))
      markSeen()
      void reload()
    }
    setOpen((o) => !o)
  }

  function text(n: Notice): ReactNode {
    // the name carries the colours of the member's wins role, like everywhere else on the site
    const who = <RoleName wins={n.who ? wins.byId.get(n.who) : undefined}>{nameOf(n.who)}</RoleName>
    switch (n.kind) {
      case 'game_reaction':
        return de ? <>{who} hat auf dein Spiel reagiert {n.detail}</> : <>{who} reacted to your game {n.detail}</>
      case 'comment_reaction':
        return de ? <>{who} hat auf deinen Kommentar reagiert {n.detail}</> : <>{who} reacted to your comment {n.detail}</>
      case 'game_comment':
        return de ? <>{who} hat ein Spiel von dir kommentiert</> : <>{who} commented on a game of yours</>
      case 'comment_reply':
        return de ? <>{who} hat auf deinen Kommentar geantwortet</> : <>{who} replied to your comment</>
      case 'profile_like':
        return de ? <>{who} gefällt dein Profil</> : <>{who} likes your profile</>
      case 'profile_comment':
        return de ? <>{who} hat auf deine Pinnwand geschrieben</> : <>{who} wrote on your wall</>
      case 'quest': {
        const q = QUESTS.find((x) => x.id === n.detail)
        const qt = q ? t.quests.items[q.id as keyof typeof t.quests.items] : undefined
        const name = qt?.name ?? (de ? q?.de?.name : undefined) ?? q?.name ?? ''
        return de ? `Quest zum Abholen: ${name}` : `Quest ready to collect: ${name}`
      }
      case 'report':
        return de ? `${n.detail} offene Meldung(en)` : `${n.detail} open report(s)`
    }
  }

  const rowClass = 'flex items-start gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-base-800'
  const rowBody = (n: Notice) => (
    <>
      <span className="mt-0.5 w-5 shrink-0 text-center text-base leading-none">{ICON[n.kind]}</span>
      <span className="min-w-0 flex-1">
        <span className={newAtOpen.has(n.id) || (!open && isUnread(n)) ? 'font-semibold text-white' : 'text-slate-300'}>{text(n)}</span>
        {n.at != null && <span className="block text-xs text-slate-500">{relativeTime(n.at, t)}</span>}
      </span>
      {newAtOpen.has(n.id) && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" aria-hidden />}
    </>
  )

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        onClick={toggle}
        className="relative inline-flex h-10 items-center gap-2 rounded-lg border border-base-600 bg-base-800/60 px-3 text-sm font-semibold text-slate-200 transition-colors hover:border-accent hover:text-white"
        aria-label={de ? 'Benachrichtigungen' : 'Notifications'}
        aria-expanded={open}
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8" />
          <path d="M10.3 20a2 2 0 0 0 3.4 0" />
        </svg>
        <span className="hidden sm:inline">{de ? 'Benachrichtigungen' : 'Notifications'}</span>
        {unread > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white ring-2 ring-base-900">{unread > 9 ? '9+' : unread}</span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-base-600 bg-base-850 shadow-xl">
          <div className="flex items-center justify-between border-b border-base-700 px-4 py-2.5">
            <span className="font-display text-sm font-bold uppercase tracking-wide text-gold">{de ? 'Benachrichtigungen' : 'Notifications'}</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={toggleSound}
                className="rounded-md border border-base-600 px-2 py-1 text-xs font-semibold text-slate-300 hover:border-accent hover:text-white"
                title={sound ? (de ? 'Ton ausschalten' : 'Turn sound off') : de ? 'Ton einschalten' : 'Turn sound on'}
                aria-pressed={sound}
              >
                {sound ? '🔔' : '🔕'} {sound ? (de ? 'Ton an' : 'Sound on') : de ? 'Ton aus' : 'Sound off'}
              </button>
              <button
                type="button"
                onClick={() => {
                  markSeen()
                  setNewAtOpen(new Set())
                }}
                disabled={notices.length === 0}
                className="rounded-md border border-base-600 px-2 py-1 text-xs font-semibold text-slate-300 hover:border-accent hover:text-white disabled:opacity-40"
              >
                {de ? 'Alle gelesen' : 'Read all'}
              </button>
            </div>
          </div>
          <div className="max-h-[70vh] overflow-y-auto">
            {notices.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">{de ? 'Noch nichts Neues.' : 'Nothing new yet.'}</p>
            ) : (
              <ul className="divide-y divide-base-700/60">
                {notices.map((n) => (
                  <li key={n.id}>
                    {n.to.startsWith('/history?game=') ? (
                      // a full page load: the History page opens the report from the address when it starts
                      <a href={n.to} className={rowClass} onClick={() => setOpen(false)}>
                        {rowBody(n)}
                      </a>
                    ) : (
                      <Link to={n.to} className={rowClass} onClick={() => setOpen(false)}>
                        {rowBody(n)}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
