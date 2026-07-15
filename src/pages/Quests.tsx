import { useEffect, useState } from 'react'
import { useProfile } from '../lib/useProfile'
import { useRoster } from '../lib/useRoster'
import { RegistrationGate, StatsShell } from '../components/StatsShell'
import { SectionHeading, Card, Spinner, useCountdown } from '../components/ui'
import { QUESTS, fetchClaimsToday, claimQuest, todayKey, nextResetAt } from '../lib/quests'
import { xpProgress, titleForLevel, MAX_LEVEL } from '../lib/levels'
import { useLanguage } from '../i18n/LanguageContext'

export default function Quests() {
  const { profile } = useProfile()
  const { t } = useLanguage()
  const { data, loading, refresh } = useRoster(!!profile)
  const [claimedToday, setClaimedToday] = useState<Set<string>>(new Set())
  const [busyId, setBusyId] = useState<string | null>(null)
  const [msg, setMsg] = useState<Record<string, string>>({})
  const resetCountdown = useCountdown(nextResetAt())

  const me = data?.members.find((m) => m.publicId === profile?.openfront_id)

  useEffect(() => {
    if (profile) fetchClaimsToday(profile.openfront_id).then(setClaimedToday)
  }, [profile, data]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!profile) return <RegistrationGate />
  if (loading || !me) return <Spinner label={t.common.loadingLiveData} />

  const progress = xpProgress(me.xp)
  const coop = data?.coopByGame ?? {}

  async function onClaim(questId: string) {
    if (!profile || !me) return
    const quest = QUESTS.find((q) => q.id === questId)!
    setBusyId(questId)
    const r = await claimQuest(profile.openfront_id, quest, me, coop)
    setMsg((m) => ({ ...m, [questId]: r.message }))
    setBusyId(null)
    if (r.ok) {
      setClaimedToday((s) => new Set(s).add(questId))
      refresh()
    }
  }

  return (
    <StatsShell>
      <section className="space-y-4">
        <SectionHeading center eyebrow={t.quests.eyebrowProgression} title={t.nav.quests} />
        <Card className="text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-gold">{titleForLevel(progress.level)}</p>
          <p className="mt-1 font-display text-3xl font-bold text-white">
            {t.quests.levelPrefix} {progress.level}
            {progress.level < MAX_LEVEL && <span className="text-base font-normal text-slate-500"> / {MAX_LEVEL}</span>}
          </p>
          {progress.next != null ? (
            <>
              <div className="mx-auto mt-3 h-2 w-full max-w-xs overflow-hidden rounded-full bg-base-700">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-accent to-gold"
                  style={{ width: `${Math.min(100, (progress.into / progress.span) * 100)}%` }}
                />
              </div>
              <p className="mt-1.5 text-xs text-slate-500">
                {t.quests.xpToNext(me.xp, progress.span - progress.into, progress.level + 1)}
              </p>
            </>
          ) : (
            <p className="mt-2 text-xs text-slate-500">{t.quests.maxLevelReached(me.xp)}</p>
          )}
        </Card>
      </section>

      <section className="space-y-4">
        <SectionHeading center eyebrow={`${t.quests.resetsDailyPrefix} · ${todayKey()}`} title={t.quests.dailyQuestsTitle} />
        <div className="space-y-3">
          {QUESTS.map((q) => {
            const done = q.check(me, coop)
            const claimed = claimedToday.has(q.id)
            const qt = t.quests.items[q.id as keyof typeof t.quests.items]
            return (
              <Card key={q.id} className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-white">{qt?.name ?? q.name}</p>
                  <p className="text-sm text-slate-400">{qt?.description ?? q.description}</p>
                  {msg[q.id] && <p className="mt-1 text-xs text-slate-500">{msg[q.id]}</p>}
                  {claimed && (
                    <p className="mt-1 text-xs text-slate-500">
                      {resetCountdown ? t.quests.resetsIn(resetCountdown) : t.quests.resetsInAMoment}
                    </p>
                  )}
                  {!claimed && done && <p className="mt-1 text-xs font-semibold text-signal-green">{t.quests.ready}</p>}
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-display text-sm font-bold text-gold-light">+{q.xp} XP</span>
                  <button
                    disabled={claimed || !done || busyId === q.id}
                    onClick={() => onClaim(q.id)}
                    className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                      claimed
                        ? 'cursor-not-allowed bg-base-700 text-slate-500'
                        : done
                          ? 'bg-signal-green/15 text-signal-green hover:bg-signal-green/25'
                          : 'cursor-not-allowed bg-base-700 text-slate-500'
                    }`}
                  >
                    {claimed ? t.quests.claimed : busyId === q.id ? t.quests.claiming : done ? t.quests.claim : t.quests.notYet}
                  </button>
                </div>
              </Card>
            )
          })}
        </div>
        <p className="text-center text-xs text-slate-500">{t.quests.footerNote(MAX_LEVEL)}</p>
      </section>
    </StatsShell>
  )
}
