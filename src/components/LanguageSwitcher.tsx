import { useEffect, useRef, useState } from 'react'
import { languages } from '../i18n/translations'
import { useLanguage } from '../i18n/LanguageContext'
import { Emoji } from './Emoji'

export default function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const current = languages.find((l) => l.code === language) ?? languages[0]

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Change language"
        aria-expanded={open}
        className="btn-ghost inline-flex items-center gap-1.5 !px-3 !py-2 text-xs font-bold uppercase tracking-wide"
      >
        <Emoji char={current.flag} className="h-3.5 w-3.5" />
        <span className="hidden min-[400px]:inline">{language}</span>
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-36 overflow-hidden rounded-lg border border-base-600 bg-base-850 shadow-xl">
          {languages.map((l) => (
            <button
              key={l.code}
              onClick={() => {
                setLanguage(l.code)
                setOpen(false)
              }}
              className={`flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm transition-colors ${
                language === l.code ? 'bg-base-800 font-semibold text-white' : 'text-slate-200 hover:bg-base-800'
              }`}
            >
              <Emoji char={l.flag} className="h-4 w-4" />
              {l.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
