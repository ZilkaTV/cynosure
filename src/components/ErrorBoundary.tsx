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

// After a deploy, an already-open tab still points at the OLD hashed chunk
// filenames. The server answers those with the SPA's index.html (HTTP 200,
// text/html - confirmed live), so the dynamic import fails and the visitor
// used to land on the generic crash page, needing a manual reload to get
// the new build. Treat exactly that failure as "a new version is out" and
// reload once automatically. The sessionStorage timestamp stops a reload
// loop if the chunk is genuinely broken rather than just stale.
const CHUNK_RELOAD_KEY = 'cyn:chunkReloadAt'
const CHUNK_ERROR_RE = /dynamically imported module|importing a module script failed|loading chunk|loading css chunk/i

function reloadOnceForStaleChunk(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  if (!CHUNK_ERROR_RE.test(message)) return false
  try {
    const last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) ?? 0)
    if (Date.now() - last < 60_000) return false
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()))
  } catch {
    return false
  }
  window.location.reload()
  return true
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
    if (reloadOnceForStaleChunk(error)) return
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
