import { useEffect, useRef, useState } from 'react'
import { languages } from '../i18n/translations'
import { useLanguage } from '../i18n/LanguageContext'
import { Emoji } from './Emoji'

const PICK: Record<string, string> = {
  en: 'Select language',
  de: 'Sprache wählen',
  fr: 'Choisir la langue',
  ru: 'Выбрать язык',
  it: 'Scegli la lingua',
  es: 'Elegir idioma',
  ko: '언어 선택',
}

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
        className="top-btn"
      >
        <Emoji char={current.flag} className="h-4 w-4 shrink-0" />
        <span className="hidden flex-col items-start leading-tight sm:flex">
          <span className="text-sm">{current.label}</span>
          <span className="text-[9px] font-normal uppercase tracking-wide text-slate-500">{PICK[language] ?? PICK.en}</span>
        </span>
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
