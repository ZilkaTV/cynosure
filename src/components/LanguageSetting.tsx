import { languages } from '../i18n/translations'
import { useLanguage } from '../i18n/LanguageContext'
import { Emoji } from './Emoji'

/** Settings: the language of the site, one button per language. */
export default function LanguageSetting() {
  const { language, setLanguage } = useLanguage()
  const de = language === 'de'
  return (
    <div className="panel mx-auto mb-6 max-w-xl space-y-3 p-5">
      <h3 className="font-display text-lg font-bold text-white">{de ? 'Sprache' : 'Language'}</h3>
      <div className="flex flex-wrap gap-2">
        {languages.map((l) => (
          <button
            key={l.code}
            type="button"
            onClick={() => setLanguage(l.code)}
            aria-pressed={language === l.code}
            className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm transition-colors ${
              language === l.code ? 'border-accent bg-accent/15 font-semibold text-white' : 'border-base-600 bg-base-800 text-slate-300 hover:border-accent hover:text-white'
            }`}
          >
            <Emoji char={l.flag} className="h-4 w-4" />
            {l.label}
          </button>
        ))}
      </div>
    </div>
  )
}
