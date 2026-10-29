import { useEffect, useState } from 'react'
import { CHANGELOG } from '../data/changelog'
import { useLanguage } from '../i18n/LanguageContext'

const SEEN_KEY = 'cyn:seen-update'

function readSeen(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY)
  } catch {
    return null
  }
}

/**
 * A window with the changes of the latest site update, shown once per browser when the site is opened after the update.
 * Not on the dev copy of the site (small changes there all the time); ?whatsnew=1 previews it anywhere.
 */
export default function WhatsNew() {
  const { language } = useLanguage()
  const latest = CHANGELOG[0]
  const isDevSite = /^(dev\.|cynosure-dev\.)/.test(window.location.hostname)
  const preview = new URLSearchParams(window.location.search).has('whatsnew')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!latest) return
    if (preview || (!isDevSite && readSeen() !== latest.id)) setOpen(true)
  }, [latest, isDevSite, preview])

  if (!open || !latest) return null
  const text = language === 'de' ? latest.de : latest.en
  const close = () => {
    setOpen(false)
    try {
      localStorage.setItem(SEEN_KEY, latest.id)
    } catch {
      /* private window: it just shows again next time */
    }
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={close} role="dialog" aria-modal="true" aria-label={text.title}>
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-base-600 bg-base-900 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <p className="text-xs font-semibold uppercase tracking-widest text-gold">{new Date(latest.date).toLocaleDateString(language === 'de' ? 'de-DE' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
        <h2 className="mt-1 font-display text-xl font-bold text-white">{text.title}</h2>
        {latest.images && latest.images.length > 0 && (
          <div className="mt-4 grid gap-2">
            {latest.images.map((img) => (
              <img key={img.url} src={img.url} alt={img.alt} className="w-full rounded-lg border border-base-700" />
            ))}
          </div>
        )}
        <ul className="mt-4 space-y-2 text-sm text-slate-300">
          {text.items.map((item) => (
            <li key={item} className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
        <button type="button" onClick={close} className="btn-accent mt-6 w-full">
          OK
        </button>
      </div>
    </div>
  )
}
