import { useEffect, useState } from 'react'
import { useProfile } from '../lib/useProfile'
import { useRoster } from '../lib/useRoster'
import { RegistrationGate, StatsShell } from '../components/StatsShell'
import { SectionHeading, Card, Spinner, LastUpdated, useCountdown } from '../components/ui'
import { QUESTS, fetchClaimRounds, fetchClaimsToday, claimQuest, nextResetAt, periodKey, questPeriod, winProgress, type QuestDef } from '../lib/quests'
import { donationTotals, useClanDonors } from '../lib/clanDonors'
import { fetchReactedToday } from '../lib/reactions'
import { currentBoosterState } from '../lib/boosters'
import { cardTrainedThisMonth } from '../lib/cardSnapshots'
import { QUESTS_CHANGED } from '../lib/notifications'
import { claimReferral, useReferral } from '../lib/referrals'
import { xpProgress, titleForLevel, MAX_LEVEL } from '../lib/levels'
import { useLanguage } from '../i18n/LanguageContext'

export default function Quests() {
  const { profile } = useProfile()
  const { t, language } = useLanguage()
  const de = language === 'de'
  const { data, loading, lastUpdated, refreshing, refresh } = useRoster(!!profile)
  const [claimedToday, setClaimedToday] = useState<Set<string>>(new Set())
  const [reactedToday, setReactedToday] = useState(false)
  const [openedBooster, setOpenedBooster] = useState(false)
  const [cardTrained, setCardTrained] = useState(false)
  // win quests: how many rounds (10 wins each) were claimed so far
  const [rounds, setRounds] = useState<Record<string, number>>({})
  const [busyId, setBusyId] = useState<string | null>(null)
  const [msg, setMsg] = useState<Record<string, string>>({})
  const countdowns = { day: useCountdown(nextResetAt('day')), week: useCountdown(nextResetAt('week')), month: useCountdown(nextResetAt('month')) }
  const donors = useClanDonors()

  const me = data?.members.find((m) => m.publicId === profile?.openfront_id)

  useEffect(() => {
    if (profile) {
      fetchClaimsToday(profile.openfront_id).then(setClaimedToday)
      fetchReactedToday(profile.openfront_id).then(setReactedToday)
      void currentBoosterState().then((b) => setOpenedBooster(!!b?.openedToday))
      void cardTrainedThisMonth(profile.openfront_id).then(setCardTrained)
      void fetchClaimRounds(profile.openfront_id).then(setRounds)
    }
  }, [profile, data])

  if (!profile) return <RegistrationGate />
  if (loading || !me) return <Spinner label={t.common.loadingLiveData} />

  const progress = xpProgress(me.xp)
  const coop = data?.coopByGame ?? {}
  const donated = donationTotals(donors, me.publicId)
  const ctx = { reactedToday, donated, openedBooster, cardTrained, rounds }

  async function onClaim(questId: string) {
    if (!profile || !me) return
    const quest = QUESTS.find((q) => q.id === questId)!
    setBusyId(questId)
    const r = await claimQuest(profile.openfront_id, quest, me, coop, ctx)
    setMsg((m) => ({ ...m, [questId]: r.message }))
    setBusyId(null)
    if (r.ok) {
      // a win quest goes on with the next round, the others are done until their period is over
      if (quest.wins) setRounds((r) => ({ ...r, [questId]: (r[questId] ?? 0) + 1 }))
      else setClaimedToday((s) => new Set(s).add(questId))
      window.dispatchEvent(new Event(QUESTS_CHANGED)) // the Quests entry of the menu stops glowing
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

      <ReferralQuest />

      <section className="space-y-4">
        <SectionHeading
          center
          eyebrow={de ? 'Zählt ab dem 3. November · jeweils 10 Siege' : 'Counts from 3 November · 10 wins each'}
          title={de ? 'Sieg-Quests' : 'Win quests'}
        />
        <div className="space-y-3">
          {QUESTS.filter((q) => q.wins).map((q) => {
            const wp = winProgress(q, me, coop, ctx)
            return (
              <QuestRow
                key={q.id}
                q={q}
                done={wp.ready}
                claimed={false}
                busy={busyId === q.id}
                message={msg[q.id]}
                resetIn={null}
                onClaim={() => onClaim(q.id)}
                donorsUpdated={donors?.updated_at}
                donorsHaveRecent={donated.hasRecent}
                progress={{ value: wp.value, target: wp.target }}
                winInfo={{ rounds: wp.rounds, total: wp.total }}
              />
            )
          })}
        </div>
        <p className="text-center text-xs text-slate-500">
          {de ? 'Sind 10 Siege erreicht, holst du die XP ab, und der Balken beginnt von vorn. Es zählen nur Spiele mit dem [CYN]-Tag.' : 'At 10 wins you claim the XP and the bar starts again. Only games with the [CYN] tag count.'}
        </p>
      </section>

      {(['day', 'week', 'month'] as const).map((period) => {
        const list = QUESTS.filter((q) => questPeriod(q) === period && !q.wins)
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
                <QuestRow key={q.id} q={q} done={q.check(me, coop, ctx)} claimed={claimedToday.has(q.id)} busy={busyId === q.id} message={msg[q.id]} resetIn={countdowns[period]} onClaim={() => onClaim(q.id)} donorsUpdated={donors?.updated_at} donorsHaveRecent={donated.hasRecent} progress={q.progress && donated.hasRecent ? q.progress(ctx) : undefined} />
              ))}
            </div>
            {period === 'day' && <p className="text-center text-xs text-slate-500">{t.quests.footerNote(MAX_LEVEL)}</p>}
          </section>
        )
      })}
    </StatsShell>
  )
}

/** "Invite a friend": a member who named you as the one who brought them gives you a booster (instead of XP); the quest comes back for the next friend. */
function ReferralQuest() {
  const { language } = useLanguage()
  const de = language === 'de'
  const { state } = useReferral(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const pending = state?.pending ?? 0
  async function claim() {
    setBusy(true)
    setMessage(null)
    const problem = await claimReferral()
    setBusy(false)
    setMessage(problem ? (de ? 'Das hat nicht geklappt. Versuch es gleich noch einmal.' : 'That did not work. Try again in a moment.') : de ? '+1 Booster!' : '+1 booster!')
  }
  return (
    <section className="space-y-4">
      <SectionHeading center eyebrow={de ? 'Neu' : 'New'} title={de ? 'Freunde werben' : 'Invite a friend'} />
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-white">{de ? 'Hol einen Freund auf die Seite' : 'Bring a friend to the site'}</p>
          <p className="text-sm text-slate-400">
            {de
              ? 'Nennt dich ein neues Mitglied in den Einstellungen als den, der es geworben hat, bekommst du dafür einen Booster statt XP. Danach ist die Quest wieder frei für den nächsten Freund.'
              : 'When a new member names you in the settings as the one who brought them, you get a booster instead of XP. Then the quest is open again for the next friend.'}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {de ? `Bisher geworben: ${state?.total ?? 0}` : `Friends brought so far: ${state?.total ?? 0}`}
            {pending > 0 && <span className="ml-2 font-semibold text-signal-green">{de ? `${pending} Booster zum Abholen` : `${pending} booster(s) to collect`}</span>}
          </p>
          {message && <p className="mt-1 text-xs text-slate-500">{message}</p>}
        </div>
        <div className="flex items-center gap-3">
          <span className="font-display text-sm font-bold text-gold-light">+1 Booster</span>
          <button
            disabled={pending === 0 || busy}
            onClick={() => void claim()}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${pending > 0 ? 'bg-signal-green/15 text-signal-green hover:bg-signal-green/25' : 'cursor-not-allowed bg-base-700 text-slate-500'}`}
          >
            {busy ? '…' : pending > 0 ? (de ? 'Abholen' : 'Claim') : de ? 'Noch nicht' : 'Not yet'}
          </button>
        </div>
      </Card>
    </section>
  )
}

function QuestRow({ q, done, claimed, busy, message, resetIn, onClaim, donorsUpdated, donorsHaveRecent, progress, winInfo }: { progress?: { value: number; target: number }; winInfo?: { rounds: number; total: number }; q: QuestDef; done: boolean; claimed: boolean; busy: boolean; message?: string; resetIn: string | null; onClaim: () => void; donorsUpdated?: string; donorsHaveRecent: boolean }) {
  const { t, language } = useLanguage()
  const de = language === 'de'
  const qt = t.quests.items[q.id as keyof typeof t.quests.items]
  const name = qt?.name ?? (de ? q.de?.name : undefined) ?? q.name
  // the translated descriptions of the win quests still say "Win 1 ...": they use the texts of the quest itself
  const description = (q.wins ? undefined : qt?.description) ?? (de ? q.de?.description : undefined) ?? q.description
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
        {progress && !claimed && (
          <div className="mt-2 flex max-w-xs items-center gap-2" title={`${progress.value} / ${progress.target}`}>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-base-700" role="progressbar" aria-valuemin={0} aria-valuemax={progress.target} aria-valuenow={Math.min(progress.value, progress.target)}>
              <div className={`h-full rounded-full transition-all ${progress.value >= progress.target ? 'bg-signal-green' : 'bg-gradient-to-r from-accent to-gold'}`} style={{ width: `${Math.min(100, (progress.value / progress.target) * 100)}%` }} />
            </div>
            <span className="shrink-0 text-xs font-semibold tabular-nums text-slate-300">
              {Math.min(progress.value, progress.target).toLocaleString(de ? 'de-DE' : 'en-GB')} / {progress.target.toLocaleString(de ? 'de-DE' : 'en-GB')}
            </span>
          </div>
        )}
        {winInfo && (
          <p className="mt-1 text-xs text-slate-500">
            {de ? `Runde ${winInfo.rounds + 1} · ${winInfo.total} Siege gezählt${winInfo.rounds > 0 ? ` · ${winInfo.rounds}× abgeholt` : ''}` : `Round ${winInfo.rounds + 1} · ${winInfo.total} wins counted${winInfo.rounds > 0 ? ` · claimed ${winInfo.rounds}×` : ''}`}
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
