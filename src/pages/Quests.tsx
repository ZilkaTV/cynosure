import { useEffect, useState } from 'react'
import { useProfile } from '../lib/useProfile'
import { useRoster } from '../lib/useRoster'
import { RegistrationGate, StatsShell } from '../components/StatsShell'
import { SectionHeading, Card, Spinner, LastUpdated, useCountdown } from '../components/ui'
import { QUESTS, fetchClaimsToday, claimQuest, nextResetAt, periodKey, questPeriod, type QuestDef } from '../lib/quests'
import { donationTotals, useClanDonors } from '../lib/clanDonors'
import { fetchReactedToday } from '../lib/reactions'
import { xpProgress, titleForLevel, MAX_LEVEL } from '../lib/levels'
import { useLanguage } from '../i18n/LanguageContext'

export default function Quests() {
  const { profile } = useProfile()
  const { t, language } = useLanguage()
  const de = language === 'de'
  const { data, loading, lastUpdated, refreshing, refresh } = useRoster(!!profile)
  const [claimedToday, setClaimedToday] = useState<Set<string>>(new Set())
  const [reactedToday, setReactedToday] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [msg, setMsg] = useState<Record<string, string>>({})
  const countdowns = { day: useCountdown(nextResetAt('day')), week: useCountdown(nextResetAt('week')), month: useCountdown(nextResetAt('month')) }
  const donors = useClanDonors()

  const me = data?.members.find((m) => m.publicId === profile?.openfront_id)

  useEffect(() => {
    if (profile) {
      fetchClaimsToday(profile.openfront_id).then(setClaimedToday)
      fetchReactedToday(profile.openfront_id).then(setReactedToday)
    }
  }, [profile, data])

  if (!profile) return <RegistrationGate />
  if (loading || !me) return <Spinner label={t.common.loadingLiveData} />

  const progress = xpProgress(me.xp)
  const coop = data?.coopByGame ?? {}
  const donated = donationTotals(donors, me.publicId)
  const ctx = { reactedToday, donated }

  async function onClaim(questId: string) {
    if (!profile || !me) return
    const quest = QUESTS.find((q) => q.id === questId)!
    setBusyId(questId)
    const r = await claimQuest(profile.openfront_id, quest, me, coop, ctx)
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

      {(['day', 'week', 'month'] as const).map((period) => {
        const list = QUESTS.filter((q) => questPeriod(q) === period)
        const heading = {
          day: { eyebrow: `${t.quests.resetsDailyPrefix} · ${periodKey('day')}`, title: t.quests.dailyQuestsTitle },
          week: { eyebrow: de ? 'Setzt sich jeden Montag zurück (UTC)' : 'Resets every Monday (UTC)', title: de ? 'Wöchentliche Quests' : 'Weekly quests' },
          month: { eyebrow: de ? 'Setzt sich am 1. des Monats zurück (UTC)' : 'Resets on the 1st of the month (UTC)', title: de ? 'Monatliche Quests' : 'Monthly quests' },
        }[period]
        return (
          <section key={period} className="space-y-4">
            <SectionHeading center eyebrow={heading.eyebrow} title={heading.title} />
            {period === 'day' && <LastUpdated ts={lastUpdated} onRefresh={refresh} refreshing={refreshing} />}
            <div className="space-y-3">
              {list.map((q) => (
                <QuestRow key={q.id} q={q} done={q.check(me, coop, ctx)} claimed={claimedToday.has(q.id)} busy={busyId === q.id} message={msg[q.id]} resetIn={countdowns[period]} onClaim={() => onClaim(q.id)} donorsUpdated={donors?.updated_at} donorsHaveRecent={donated.hasRecent} />
              ))}
            </div>
            {period === 'day' && <p className="text-center text-xs text-slate-500">{t.quests.footerNote(MAX_LEVEL)}</p>}
          </section>
        )
      })}
    </StatsShell>
  )
}

function QuestRow({ q, done, claimed, busy, message, resetIn, onClaim, donorsUpdated, donorsHaveRecent }: { q: QuestDef; done: boolean; claimed: boolean; busy: boolean; message?: string; resetIn: string | null; onClaim: () => void; donorsUpdated?: string; donorsHaveRecent: boolean }) {
  const { t, language } = useLanguage()
  const de = language === 'de'
  const qt = t.quests.items[q.id as keyof typeof t.quests.items]
  const name = qt?.name ?? (de ? q.de?.name : undefined) ?? q.name
  const description = qt?.description ?? (de ? q.de?.description : undefined) ?? q.description
  const donation = q.id.startsWith('donate_')
  return (
    <Card className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="font-semibold text-white">{name}</p>
        <p className="text-sm text-slate-400">{description}</p>
        {donation && (
          <p className="mt-1 text-xs text-slate-500">
            {donorsHaveRecent
              ? de
                ? `Geprüft an der Spenden-Liste des Clans (Stand: ${donorsUpdated ? new Date(donorsUpdated).toLocaleString('de-DE', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : '–'}). Neue Spenden erscheinen, sobald ein Admin die Liste aktualisiert hat.`
                : `Checked against the clan's donor list (updated: ${donorsUpdated ? new Date(donorsUpdated).toLocaleString('en-GB', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}). New donations show up once an admin has refreshed the list.`
              : de
                ? 'Noch keine Spenden-Liste mit einzelnen Spenden vorhanden: ein Admin muss sie erst aktualisieren.'
                : 'There is no donor list with single donations yet: an admin has to refresh it first.'}
          </p>
        )}
        {message && <p className="mt-1 text-xs text-slate-500">{message}</p>}
        {claimed && <p className="mt-1 text-xs text-slate-500">{resetIn ? t.quests.resetsIn(resetIn) : t.quests.resetsInAMoment}</p>}
        {!claimed && done && <p className="mt-1 text-xs font-semibold text-signal-green">{t.quests.ready}</p>}
      </div>
      <div className="flex items-center gap-3">
        <span className="font-display text-sm font-bold text-gold-light">+{q.xp} XP</span>
        <button
          disabled={claimed || !done || busy}
          onClick={onClaim}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
            claimed ? 'cursor-not-allowed bg-base-700 text-slate-500' : done ? 'bg-signal-green/15 text-signal-green hover:bg-signal-green/25' : 'cursor-not-allowed bg-base-700 text-slate-500'
          }`}
        >
          {claimed ? t.quests.claimed : busy ? t.quests.claiming : done ? t.quests.claim : t.quests.notYet}
        </button>
      </div>
    </Card>
  )
}
