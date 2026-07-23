import { Component, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { useLanguage } from '../i18n/LanguageContext'
import type { TranslationShape } from '../i18n/translations'

interface Props {
  t: TranslationShape
  children: ReactNode
}

interface State {
  hasError: boolean
}

// Class component because React only supports error boundaries via
// componentDidCatch/getDerivedStateFromError - there's no hook equivalent.
// Localized text is passed in as a prop from the functional wrapper below,
// since a class component can't call the useLanguage() hook itself.
class ErrorBoundaryClass extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: unknown) {
    console.error('Uncaught render error:', error)
  }

  render() {
    if (this.state.hasError) {
      const { t } = this.props
      return (
        <div className="mx-auto max-w-lg py-20 text-center">
          <h1 className="font-display text-2xl font-bold text-white">{t.errorBoundary.title}</h1>
          <p className="mt-2 text-slate-400">{t.errorBoundary.body}</p>
          <button onClick={() => window.location.reload()} className="btn-accent mt-6 inline-flex">
            {t.errorBoundary.reload}
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

export default function ErrorBoundary({ children }: { children: ReactNode }) {
  const { t } = useLanguage()
  // Keyed by pathname so navigating to a different page remounts the
  // boundary and clears a previous crash instead of it sticking forever.
  const { pathname } = useLocation()
  return (
    <ErrorBoundaryClass key={pathname} t={t}>
      {children}
    </ErrorBoundaryClass>
  )
}
