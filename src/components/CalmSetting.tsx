import { useState } from 'react'
import { useLanguage } from '../i18n/LanguageContext'

const KEY = 'cyn:calm'
// the same names as in Layout.tsx (kept here so this file only exports a component)
const CHANGED = 'cyn:calm-changed'

/** Settings: calm mode. The glowing names, frames and lightning stand still, which saves a lot of graphics power (for example while a stream runs next to the site). */
export default function CalmSetting() {
  const { language } = useLanguage()
  const de = language === 'de'
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem(KEY) === '1'
    } catch {
      return false
    }
  })
  function toggle(next: boolean) {
    setOn(next)
    try {
      if (next) localStorage.setItem(KEY, '1')
      else localStorage.removeItem(KEY)
    } catch {
      /* private window: it just does not stay */
    }
    window.dispatchEvent(new Event(CHANGED))
  }
  return (
    <div className="panel mx-auto mb-6 max-w-xl space-y-2 p-5">
      <h3 className="font-display text-lg font-bold text-white">{de ? 'Ruhiger Modus' : 'Calm mode'}</h3>
      <label className="flex cursor-pointer items-start gap-3 text-sm text-slate-300">
        <input type="checkbox" checked={on} onChange={(e) => toggle(e.target.checked)} className="mt-1 accent-[#8b5cf6]" />
        <span>
          {de
            ? 'Leuchtende Namen, Rahmen und Blitze stehen still. Spart viel Grafikleistung, zum Beispiel wenn nebenbei ein Stream läuft.'
            : 'Glowing names, frames and lightning stand still. Saves a lot of graphics power, for example while a stream runs next to the site.'}
        </span>
      </label>
      <p className="text-xs text-slate-500">{de ? 'Auch ohne diesen Schalter ruht alles von selbst, solange das Fenster der Seite nicht im Vordergrund ist.' : 'Even without this switch everything rests by itself while the window of the site is not in front.'}</p>
    </div>
  )
}
