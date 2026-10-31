import { useCallback, useEffect, useState } from 'react'
import { useLanguage } from '../i18n/LanguageContext'

const CHECK_EVERY_MS = 3 * 60 * 1000

/** Set by the Update button right before it reloads, so the "what's new" window can open once after exactly that reload. */
export const WHATS_NEW_AFTER_UPDATE_KEY = 'cyn:whatsnew-after-update'

/** Hashed entry bundle of the page that is running right now, e.g. "/assets/index-AbC123.js". */
function loadedBundle(): string | null {
  const el = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/index-"]')
  return el ? new URL(el.src, location.href).pathname : null
}

/**
 * Tells whether a newer deployment of the site exists. index.html is served with no-store and names the hashed
 * bundle of its deploy, so a different bundle name there means this tab is out of date. While an update is
 * waiting, the tab title alternates with a red-dot alert (like the game-night reminder).
 */
export function useSiteUpdate() {
  const { t } = useLanguage()
  const [available, setAvailable] = useState(false)

  const check = useCallback(async () => {
    const current = loadedBundle()
    if (!current) return
    try {
      const res = await fetch(`/?v=${Date.now()}`, { cache: 'no-store' })
      if (!res.ok) return
      const html = await res.text()
      const m = /\/assets\/index-[A-Za-z0-9_-]+\.js/.exec(html)
      if (m) setAvailable(m[0] !== current)
    } catch {
      /* offline / blocked - try again next time */
    }
  }, [])

  useEffect(() => {
    const first = setTimeout(check, 5000)
    const timer = setInterval(check, CHECK_EVERY_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') check()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', check)
    return () => {
      clearTimeout(first)
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', check)
    }
  }, [check])

  useEffect(() => {
    if (!available) return
    const base = document.title
    const alertTitle = '\u{1F534} ' + t.ui.siteUpdateTabAlert
    let on = false
    const timer = setInterval(() => {
      on = !on
      document.title = on ? alertTitle : base
    }, 1000)
    return () => {
      clearInterval(timer)
      document.title = base
    }
  }, [available, t])

  // the "what's new" window opens after this reload, even on the dev copy (see WhatsNew.tsx)
  const apply = () => {
    try {
      sessionStorage.setItem(WHATS_NEW_AFTER_UPDATE_KEY, '1')
    } catch {
      /* blocked storage: the window then only shows through its normal once-per-browser rule */
    }
    location.reload()
  }

  return { available, apply }
}
