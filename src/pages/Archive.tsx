import { Link } from 'react-router-dom'
import { SectionHeading } from '../components/ui'
import { useIsAdmin } from '../lib/useSession'
import { useLanguage } from '../i18n/LanguageContext'

/**
 * Everything that is over and only kept for the admins: the survey and its results. New archived things get a card in
 * `items`.
 */
export default function Archive() {
  const { t, language } = useLanguage()
  const isAdmin = useIsAdmin()
  const de = language === 'de'

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <p className="text-slate-400">{de ? 'Nur für Admins.' : 'Admins only.'}</p>
      </div>
    )
  }

  const items = [
    { to: '/survey', title: t.nav.survey, note: de ? 'Die Umfrage mit allen Fragen' : 'The survey with all its questions' },
    { to: '/survey/results', title: t.nav.surveyResults, note: de ? 'Die Auswertung der Umfrage' : 'The evaluation of the survey' },
  ]

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <SectionHeading center eyebrow="Admin" title={de ? 'Archiviert' : 'Archived'} />
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((i) => (
          <Link key={i.to} to={i.to} className="panel block px-5 py-4 transition-colors hover:border-accent hover:bg-base-800/60">
            <p className="font-display text-lg font-bold text-white">{i.title}</p>
            <p className="mt-1 text-sm text-slate-400">{i.note}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
