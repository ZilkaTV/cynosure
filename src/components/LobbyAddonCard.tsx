// Planner card for the optional lobby userscript (addons/cynosure-lobby-points.user.js).
// NOT USED: browser extensions/userscripts are not allowed in OpenFront, so the card is off the site. To bring it
// back, move the userscript to public/ and render <LobbyAddonCard /> on the Planner page again.
import { useEffect, useState } from 'react'
import { Card } from './ui'
import { useLanguage } from '../i18n/LanguageContext'

const ADDON_URL = '/cynosure-lobby-points.user.js'

function newerVersion(latest: string, installed: string) {
  const a = latest.split('.').map(Number)
  const b = installed.split('.').map(Number)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0)
  }
  return false
}

/** Version of the installed lobby add-on (it reports itself on this page) and the latest published one. */
function useAddonVersions() {
  const [installed, setInstalled] = useState<string | null>(() => document.documentElement.getAttribute('data-cyn-lobby-addon'))
  const [latest, setLatest] = useState<string | null>(null)
  useEffect(() => {
    const read = () => setInstalled(document.documentElement.getAttribute('data-cyn-lobby-addon'))
    window.addEventListener('cyn-lobby-addon', read)
    // The add-on runs after the page has loaded, so watch the attribute too.
    const obs = new MutationObserver(read)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-cyn-lobby-addon'] })
    let alive = true
    fetch(ADDON_URL, { cache: 'no-store' })
      .then((r) => r.text())
      .then((txt) => {
        const m = /@version\s+([\d.]+)/.exec(txt)
        if (alive && m) setLatest(m[1])
      })
      .catch(() => {})
    return () => {
      alive = false
      window.removeEventListener('cyn-lobby-addon', read)
      obs.disconnect()
    }
  }, [])
  return { installed, latest, outdated: !!(installed && latest && newerVersion(latest, installed)) }
}

export default function LobbyAddonCard() {
  const { t } = useLanguage()
  const addon = useAddonVersions()
  return (
    <Card className="mx-auto max-w-3xl space-y-3">
          <h3 className="font-display text-lg font-bold text-white">{t.planner.userscriptTitle}</h3>
          <p className="text-sm text-slate-400">{t.planner.userscriptText}</p>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-300">
            <li>{t.planner.userscriptStep1}</li>
            <li>{t.planner.userscriptStep2}</li>
            <li>{t.planner.userscriptStep3}</li>
          </ol>
          <div className="flex flex-wrap items-center gap-3">
            <a href={ADDON_URL} className="btn-accent inline-block">
              {t.planner.userscriptButton}
            </a>
            {addon.outdated || !addon.installed ? (
              <a
                href={ADDON_URL}
                className="btn-ghost relative inline-block"
                title={addon.outdated ? t.planner.userscriptUpdateNew(addon.latest ?? '') : t.planner.userscriptNotDetected}
              >
                {t.planner.userscriptUpdate}
                {addon.outdated && <span className="absolute -right-1 -top-1 h-3 w-3 animate-pulse rounded-full bg-red-500 ring-2 ring-base-900" aria-hidden />}
              </a>
            ) : (
              <button
                type="button"
                disabled
                className="btn-ghost inline-block cursor-not-allowed opacity-40"
                title={t.planner.userscriptUpToDate(addon.installed ?? '')}
              >
                {t.planner.userscriptUpdate}
              </button>
            )}
            {addon.installed && !addon.outdated && <span className="text-xs text-slate-500">{t.planner.userscriptUpToDate(addon.installed)}</span>}
          </div>
        </Card>
  )
}
