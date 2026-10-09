import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase as db } from './supabase'
import { useLanguage } from '../i18n/LanguageContext'

// "Live Ranked Queue" alert: while enabled, a finished top-100 game of the chosen ladder(s) puts a red dot on the menu
// entry, makes the tab title blink (like the game-night reminder) and plays a short sound. Opening the page clears it.
// The choice lives in this browser only (localStorage).

export type QueueAlertMode = 'off' | '1v1' | '2v2' | 'both'
const MODE_KEY = 'cyn:queueAlert'
const SOUND_KEY = 'cyn:queueAlertSound'
const SEEN_KEY = 'cyn:queueSeen'
const CHANGED = 'cyn:queue-alert-changed'
const POLL_MS = 20_000
const TEST_EVENT = 'cyn:queue-alert-test'

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* private mode / storage full - the setting then just lasts until reload */
  }
  window.dispatchEvent(new Event(CHANGED))
}

export function getAlertMode(): QueueAlertMode {
  const v = read(MODE_KEY)
  return v === '1v1' || v === '2v2' || v === 'both' ? v : 'off'
}
export const getAlertSound = () => read(SOUND_KEY) !== '0'
export const markQueueSeen = () => write(SEEN_KEY, new Date().toISOString())

// One audio context for the page, created from a click (browsers only allow sound after a user gesture).
let audio: AudioContext | null = null
export function primeSound() {
  try {
    audio ??= new AudioContext()
    void audio.resume()
  } catch {
    /* no audio available */
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
    if (!audio) return
    const now = audio.currentTime
    for (const [i, freq] of [880, 1318].entries()) {
      const osc = audio.createOscillator()
      const gain = audio.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, now + i * 0.14)
      gain.gain.exponentialRampToValueAtTime(0.18, now + i * 0.14 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.14 + 0.22)
      osc.connect(gain).connect(audio.destination)
      osc.start(now + i * 0.14)
      osc.stop(now + i * 0.14 + 0.25)
    }
  } catch {
    /* ignore */
  }
}

/** Settings for the page's control. */
export function useQueueAlertSettings() {
  const [mode, setModeState] = useState<QueueAlertMode>(getAlertMode)
  const [sound, setSoundState] = useState(getAlertSound)
  useEffect(() => {
    const sync = () => {
      setModeState(getAlertMode())
      setSoundState(getAlertSound())
    }
    window.addEventListener(CHANGED, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(CHANGED, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])
  const setMode = useCallback((m: QueueAlertMode) => {
    if (m !== 'off') {
      primeSound()
      if (getAlertMode() === 'off') markQueueSeen() // start counting from now
    }
    write(MODE_KEY, m)
  }, [])
  const setSound = useCallback((on: boolean) => {
    if (on) primeSound()
    write(SOUND_KEY, on ? '1' : '0')
  }, [])
  return { mode, sound, setMode, setSound }
}

/**
 * Mounted once in the layout: polls for new games while an alert is on. Returns how many new top-100 games of the chosen
 * ladder(s) were played since the page was last opened.
 */
export function useQueueAlert(): number {
  const { t } = useLanguage()
  const location = useLocation()
  const { mode, sound } = useQueueAlertSettings()
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

  useEffect(() => {
    if (mode === 'off') {
      setUnseen(0)
      lastCount.current = 0
      return
    }
    let alive = true
    async function poll() {
      if (onPage) return
      const seen = read(SEEN_KEY) ?? new Date().toISOString()
      let q = db.from('cyn_ranked_matches').select('game_id', { count: 'exact', head: true }).gt('ended_at', seen)
      if (mode !== 'both') q = q.eq('ladder', mode)
      const { count } = await q
      if (!alive || count == null) return
      setUnseen(count)
      if (count > lastCount.current && sound) playPing()
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
  }, [mode, sound, onPage])

  // Blinking tab title while something is unseen.
  const shown = mode === 'off' && !testing ? 0 : testing ? Math.max(unseen, 1) : unseen
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
