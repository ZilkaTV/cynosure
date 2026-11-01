import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase as db } from './supabase'
import { useLanguage } from '../i18n/LanguageContext'
import { setItemRoomy } from './storage'

// "Live Ranked Queue" alert: while enabled, a finished top-100 game of the chosen ladder(s) puts a red dot on the menu
// entry, makes the tab title blink (like the game-night reminder) and plays a short sound. Opening the page clears it.
// The choice lives in this browser only (localStorage).

export type QueueLadder = '1v1' | '2v2' | 'ffa'
const LADDERS: QueueLadder[] = ['1v1', '2v2', 'ffa']
const MODE_KEY = 'cyn:queueAlert'
const SOUND_KEY = 'cyn:queueAlertSound'
const SEEN_KEY = 'cyn:queueSeen'
const CHANGED = 'cyn:queue-alert-changed'
const POLL_MS = 60_000
const TEST_EVENT = 'cyn:queue-alert-test'

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function write(key: string, value: string) {
  setItemRoomy(key, value) // a full storage drops the browser caches to make room (src/lib/storage.ts)
  window.dispatchEvent(new Event(CHANGED))
}

/** The ladders that alert, stored as a comma list ("1v1,ffa"); older settings said "both" for 1v1 and 2v2. */
export function getAlertLadders(): QueueLadder[] {
  const v = read(MODE_KEY)
  if (!v) return []
  if (v === 'both') return ['1v1', '2v2']
  return v.split(',').filter((x): x is QueueLadder => (LADDERS as string[]).includes(x))
}
export const getAlertSound = () => read(SOUND_KEY) !== '0'
export const markQueueSeen = () => write(SEEN_KEY, new Date().toISOString())

// One audio context for the page. Browsers only start sound after a user gesture, so it is created from a click: the
// switches, the test button, and (while an alert is on) the first click / key press anywhere on the site.
let audio: AudioContext | null = null
export function primeSound() {
  try {
    audio ??= new AudioContext()
    if (audio.state !== 'running') void audio.resume()
  } catch {
    /* no audio available */
  }
}
export type DesktopPermission = 'granted' | 'denied' | 'default' | 'unsupported'
export const desktopPermission = (): DesktopPermission => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission)

/** Asks the browser to allow system notifications (must be called from a click). */
export async function askDesktopPermission(): Promise<DesktopPermission> {
  if (typeof Notification === 'undefined') return 'unsupported'
  try {
    return await Notification.requestPermission()
  } catch {
    return Notification.permission
  }
}

function showDesktopNotification(title: string, body: string) {
  try {
    if (desktopPermission() !== 'granted') return
    const n = new Notification(title, { body, tag: 'cyn-queue', icon: '/favicon-64.png' })
    n.onclick = () => {
      window.focus()
      window.location.assign('/queue')
      n.close()
    }
  } catch {
    /* some browsers only allow notifications from a service worker - the dot and the sound still work */
  }
}

/** Plays the sound and shows the dot / blinking title for a few seconds, so the setting can be checked. */
export function testQueueAlert() {
  primeSound()
  playPing()
  window.dispatchEvent(new Event(TEST_EVENT))
}

export function playPing() {
  try {
    primeSound()
    const ctx = audio
    if (!ctx) return
    const play = () => {
      const now = ctx.currentTime
      for (const [i, freq] of [880, 1318].entries()) {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.value = freq
        gain.gain.setValueAtTime(0.0001, now + i * 0.14)
        gain.gain.exponentialRampToValueAtTime(0.18, now + i * 0.14 + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.14 + 0.22)
        osc.connect(gain).connect(ctx.destination)
        osc.start(now + i * 0.14)
        osc.stop(now + i * 0.14 + 0.25)
      }
    }
    if (ctx.state === 'running') play()
    else void ctx.resume().then(play).catch(() => {})
  } catch {
    /* ignore */
  }
}

/** Settings for the page's control. */
export function useQueueAlertSettings() {
  const [ladders, setLadders] = useState<QueueLadder[]>(getAlertLadders)
  const [sound, setSoundState] = useState(getAlertSound)
  useEffect(() => {
    const sync = () => {
      setLadders(getAlertLadders())
      setSoundState(getAlertSound())
    }
    window.addEventListener(CHANGED, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(CHANGED, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])
  const [permission, setPermission] = useState<DesktopPermission>(desktopPermission)
  /** One switch per ladder: on asks the browser for permission to show notifications. */
  const toggle = useCallback((ladder: QueueLadder, on: boolean) => {
    const cur = getAlertLadders()
    const next = LADDERS.filter((l) => (l === ladder ? on : cur.includes(l)))
    if (next.length > 0) {
      primeSound()
      if (cur.length === 0) markQueueSeen() // start counting from now
    }
    write(MODE_KEY, next.join(','))
    if (on) void askDesktopPermission().then(setPermission)
  }, [])
  const setSound = useCallback((on: boolean) => {
    if (on) primeSound()
    write(SOUND_KEY, on ? '1' : '0')
  }, [])
  return { ladders, sound, setSound, toggle, permission, on: (l: QueueLadder) => ladders.includes(l) }
}

/**
 * Mounted once in the layout: polls for new games while an alert is on. Returns how many new top-100 games of the chosen
 * ladder(s) were played since the page was last opened.
 */
export function useQueueAlert(): number {
  const { t } = useLanguage()
  const location = useLocation()
  const { ladders, sound } = useQueueAlertSettings()
  const off = ladders.length === 0
  const ladderKey = ladders.join(',')
  const [unseen, setUnseen] = useState(0)
  const lastCount = useRef(0)
  const [visible, setVisible] = useState(() => document.visibilityState === 'visible' && document.hasFocus())
  const [testing, setTesting] = useState(false)
  // Being on the page only counts as seeing the games while the tab is actually in front.
  const onPage = location.pathname === '/queue' && visible

  useEffect(() => {
    const sync = () => setVisible(document.visibilityState === 'visible' && document.hasFocus())
    document.addEventListener('visibilitychange', sync)
    window.addEventListener('focus', sync)
    window.addEventListener('blur', sync)
    const test = () => {
      setTesting(true)
      setTimeout(() => setTesting(false), 6000)
    }
    window.addEventListener(TEST_EVENT, test)
    return () => {
      document.removeEventListener('visibilitychange', sync)
      window.removeEventListener('focus', sync)
      window.removeEventListener('blur', sync)
      window.removeEventListener(TEST_EVENT, test)
    }
  }, [])

  // Being on the page counts as seeing everything.
  useEffect(() => {
    if (onPage) {
      markQueueSeen()
      setUnseen(0)
      lastCount.current = 0
    }
  }, [onPage, location.key])

  // After a reload the saved setting is back but the audio context is not: the first interaction with the site
  // (click, key, touch) unlocks it, so the sound also plays while another tab or site is in front.
  useEffect(() => {
    if (off || !sound) return
    const unlock = () => primeSound()
    const events = ['pointerdown', 'keydown', 'touchstart'] as const
    for (const e of events) window.addEventListener(e, unlock, { passive: true })
    const resume = () => document.visibilityState === 'visible' && primeSound()
    document.addEventListener('visibilitychange', resume)
    return () => {
      for (const e of events) window.removeEventListener(e, unlock)
      document.removeEventListener('visibilitychange', resume)
    }
  }, [off, sound])

  useEffect(() => {
    if (off) {
      setUnseen(0)
      lastCount.current = 0
      return
    }
    let alive = true
    async function poll() {
      if (onPage) return
      const seen = read(SEEN_KEY) ?? new Date().toISOString()
      // Cancelled games (21 s, no winner) are not played games and do not alert.
      let q = db.from('cyn_ranked_matches').select('game_id', { count: 'exact', head: true }).gt('ended_at', seen).gt('duration_s', 45)
      if (ladders.length < LADDERS.length) q = q.in('ladder', ladders)
      const { count } = await q
      if (!alive || count == null) return
      setUnseen(count)
      if (count > lastCount.current) {
        if (sound) playPing()
        if (document.visibilityState === 'hidden' || !document.hasFocus()) showDesktopNotification(t.queue.tabAlert, t.queue.notifyBody(count - lastCount.current))
      }
      lastCount.current = count
    }
    void poll()
    const timer = setInterval(() => void poll(), POLL_MS)
    window.addEventListener(CHANGED, poll)
    return () => {
      alive = false
      clearInterval(timer)
      window.removeEventListener(CHANGED, poll)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ladderKey, sound, onPage, t])

  // Blinking tab title while something is unseen.
  const shown = off && !testing ? 0 : testing ? Math.max(unseen, 1) : unseen
  useEffect(() => {
    if (shown === 0) return
    const base = document.title
    const alertTitle = '\u{1F534} ' + t.queue.tabAlert
    let on = false
    const timer = setInterval(() => {
      on = !on
      document.title = on ? alertTitle : base
    }, 1000)
    return () => {
      clearInterval(timer)
      document.title = base
    }
  }, [shown, t])

  return shown
}
