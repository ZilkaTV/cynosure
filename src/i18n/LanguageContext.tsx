import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { languages, translations, type Language } from './translations'

interface LanguageContextValue {
  language: Language
  setLanguage: (lang: Language) => void
  t: (typeof translations)['en']
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined)

const STORAGE_KEY = 'cyn-language'

function getInitialLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    const hit = languages.find((l) => l.code === stored)
    if (hit) return hit.code
  } catch {
    /* private-mode/quota - fall back to browser language below */
  }
  const browserLang = navigator.language.slice(0, 2)
  return languages.find((l) => l.code === browserLang)?.code ?? 'en'
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(getInitialLanguage)

  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  const setLanguage = (lang: Language) => {
    try {
      localStorage.setItem(STORAGE_KEY, lang)
    } catch {
      /* private-mode/quota - language still switches, just won't persist */
    }
    setLanguageState(lang)
  }

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t: translations[language] }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider')
  return ctx
}
