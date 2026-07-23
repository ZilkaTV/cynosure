import { Link } from 'react-router-dom'
import { Card } from '../components/ui'
import { Emoji } from '../components/Emoji'
import { DONATE_URL } from '../config'
import { useLanguage } from '../i18n/LanguageContext'

export default function Donate() {
  const { t } = useLanguage()

  return (
    <div className="mx-auto max-w-lg space-y-6 py-10 text-center">
      <Link to="/" className="inline-block text-sm text-slate-400 hover:text-accent-light">
        {t.donate.backLink}
      </Link>

      <h1 className="font-display text-3xl font-bold text-white">{t.donate.title}</h1>
      <p className="text-slate-400">{t.donate.body}</p>

      <Card>
        <div className="flex items-center justify-center gap-2">
          <Emoji char="❤️" className="h-6 w-6" />
          <span className="font-display text-lg font-bold text-white">{t.donate.badgeTitle}</span>
        </div>
        <p className="mt-2 text-sm text-slate-400">{t.donate.badgeDesc}</p>
      </Card>

      <p className="text-xs text-slate-500">{t.donate.instructions}</p>

      <a href={DONATE_URL} target="_blank" rel="noreferrer" className="btn-accent inline-flex">
        {t.donate.continueButton}
      </a>
    </div>
  )
}
