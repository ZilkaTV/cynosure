import { Link } from 'react-router-dom'
import { nextResetAt } from '../lib/quests'
import { xpProgress, titleForLevel, MAX_LEVEL } from '../lib/levels'
import { Emoji, EMOJI } from './Emoji'
import { useCountdown } from './ui'
import { useLanguage } from '../i18n/LanguageContext'

/** Quest card: level/XP progress + countdown to the daily reset, clickable through to /quests. */
export function QuestCard({ xp }: { xp: number }) {
  const { t } = useLanguage()
  const progress = xpProgress(xp)
  const countdown = useCountdown(nextResetAt())

  return (
    <Link to="/quests" className="panel flex flex-col items-center gap-2 px-5 py-4 text-center transition-colors hover:border-accent/50">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
        <Emoji char={EMOJI.star} className="h-3.5 w-3.5" /> {t.nav.quests}
      </p>
      <p className="font-display text-2xl font-bold text-gold-light">
        {t.questCard.lvlPrefix} {progress.level}
        {progress.level < MAX_LEVEL && <span className="text-sm font-normal text-slate-500"> / {MAX_LEVEL}</span>}
      </p>
      <p className="text-xs text-accent-light">{titleForLevel(progress.level)}</p>
      {progress.next != null && (
        <div className="h-1.5 w-full max-w-[10rem] overflow-hidden rounded-full bg-base-700">
          <div
            className="h-full rounded-full bg-gradient-to-r from-accent to-gold"
            style={{ width: `${Math.min(100, (progress.into / progress.span) * 100)}%` }}
          />
        </div>
      )}
      <p className="text-[11px] text-slate-600">{countdown ? t.questCard.resetsIn(countdown) : t.questCard.resetsNow}</p>
    </Link>
  )
}
