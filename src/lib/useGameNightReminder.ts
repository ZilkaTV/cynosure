import { useEffect } from 'react'
import { useGameNights, unansweredGameNights } from './gameNights'
import { useProfile } from './useProfile'
import { useLanguage } from '../i18n/LanguageContext'

/**
 * While a signed-in member has an upcoming game night they haven't answered
 * (going / maybe / can't), the browser tab title alternates with a red-dot
 * alert so it catches the eye in a background tab. Stops as soon as they answer.
 */
export function useGameNightReminder() {
  const { profile } = useProfile()
  const { t } = useLanguage()
  const { nights } = useGameNights(!!profile)
  const pending = unansweredGameNights(nights, profile?.openfront_id).length

  useEffect(() => {
    if (pending === 0) return
    const base = document.title
    const alertTitle = '\u{1F534} ' + t.home.gameNightsTabAlert
    let on = false
    const timer = setInterval(() => {
      on = !on
      document.title = on ? alertTitle : base
    }, 1000)
    return () => {
      clearInterval(timer)
      document.title = base
    }
  }, [pending, t])
}
