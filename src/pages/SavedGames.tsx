import { useState } from 'react'
import GameDetailModal from '../components/GameDetailModal'
import { RegistrationGate } from '../components/StatsShell'
import { SectionHeading } from '../components/ui'
import { useLanguage } from '../i18n/LanguageContext'
import { unsaveGame, useArmed, useSavedGames } from '../lib/savedGames'
import { useProfile } from '../lib/useProfile'

function RemoveSaved({ label, sure, onConfirm }: { label: string; sure: string; onConfirm: () => void }) {
  const { armed, arm, disarm } = useArmed()
  return (
    <button
      type="button"
      onClick={() => {
        if (!armed) return arm()
        disarm()
        onConfirm()
      }}
      className={armed ? 'rounded-md bg-signal-red/15 px-2 py-0.5 text-xs font-semibold text-signal-red' : 'text-xs text-slate-500 hover:text-signal-red'}
    >
      {armed ? sure : label}
    </button>
  )
}

/** The games a member saved from the post-game reports. Private: only the member sees the list (it is not part of the public profile). */
export default function SavedGames() {
  const { profile } = useProfile()
  const { t, language } = useLanguage()
  const de = language === 'de'
  const saved = useSavedGames(profile?.openfront_id)
  const [openGame, setOpenGame] = useState<string | null>(null)
  if (!profile) return <RegistrationGate />
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <SectionHeading center eyebrow={t.memberProfile.savedEyebrow} title={t.memberProfile.savedTitle} />
      <p className="text-center text-xs text-slate-500">{de ? 'Nur du siehst diese Liste, sie ist nicht Teil deines öffentlichen Profils.' : 'Only you see this list, it is not part of your public profile.'}</p>
      <div className="panel divide-y divide-base-700/60">
        {saved.games.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-slate-500">{t.memberProfile.savedEmpty}</p>
        ) : (
          saved.games.map((g) => (
            <div key={g.game_id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
              <button type="button" onClick={() => setOpenGame(g.game_id)} className="font-mono text-accent-light underline-offset-2 hover:underline">
                {g.game_id}
              </button>
              <span className="min-w-0 flex-1 truncate text-slate-300">{g.title ?? ''}</span>
              <span className="text-xs text-slate-500">{new Date(g.saved_at).toLocaleDateString()}</span>
              <RemoveSaved label={t.memberProfile.savedRemove} sure={de ? 'Sicher?' : 'Sure?'} onConfirm={() => void unsaveGame(profile.openfront_id, g.game_id)} />
            </div>
          ))
        )}
      </div>
      <GameDetailModal gameId={openGame} onClose={() => setOpenGame(null)} />
    </div>
  )
}
