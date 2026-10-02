import { SectionHeading, Spinner } from '../components/ui'
import { GameNightsCard } from '../components/GameNightsCard'
import { useLanguage } from '../i18n/LanguageContext'
import { useIsInnerCircle } from '../lib/metrics'
import { useSession } from '../lib/useSession'
import { useProfile } from '../lib/useProfile'

/**
 * Where inner-circle members post and remove game nights. Everyone else only
 * sees and answers them in the card under the Discord widget (see
 * GameNightsSidebar); the database enforces the same split.
 */
export default function GameNights() {
  const { t } = useLanguage()
  const isInnerCircle = useIsInnerCircle()
  // Same reasoning as the Metrics page: a locally persisted profile with an
  // expired Supabase session would otherwise show a card whose writes fail.
  const session = useSession()
  const { profile } = useProfile()

  if (!isInnerCircle) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <p className="text-slate-400">{t.metrics.innerCircleOnly}</p>
      </div>
    )
  }

  if (session === undefined) return <Spinner label={t.metrics.loading} />

  if (session === null || !profile) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <p className="text-slate-400">{t.metrics.sessionExpired}</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-xl">
      <SectionHeading eyebrow={t.metrics.eyebrow} title={t.home.gameNightsTitle} center />
      <GameNightsCard openfrontId={profile.openfront_id} canCreate />
    </div>
  )
}
