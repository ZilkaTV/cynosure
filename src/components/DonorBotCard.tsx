import { useEffect, useState } from 'react'
import { useLanguage } from '../i18n/LanguageContext'
import { fetchDonorBotStatus, reloadClanDonors, runDonorBot, type DonorBotStatus } from '../lib/clanDonors'
import { Card } from './ui'

/** Metrics (inner circle): what the CYN bot did last - donations, members, games - and a button that runs it once. */
export default function DonorBotCard() {
  const { language } = useLanguage()
  const de = language === 'de'
  const [bot, setBot] = useState<DonorBotStatus | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [tooSoon, setTooSoon] = useState(false)
  useEffect(() => {
    void fetchDonorBotStatus().then(setBot)
  }, [])
  if (!bot) return null

  const when = (iso: string) => new Date(iso).toLocaleString(de ? 'de-DE' : 'en-GB', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })
  const why: Record<string, [string, string]> = {
    cookie_expired: ['Login-Cookie abgelaufen, bitte ein neues setzen', 'login cookie expired, please set a new one'],
    not_in_clan: ['der Bot-Account ist nicht im Clan', 'the bot account is not in the clan'],
    members_incomplete: ['die Mitgliederliste war unvollständig, alte Liste behalten', 'the member list was incomplete, the old list was kept'],
  }
  const reason = (m: string) => (why[m] ? why[m][de ? 0 : 1] : m)
  const parts: [string, string][] = [
    ['donors', de ? 'Spenden' : 'Donations'],
    ['members', de ? 'Mitglieder' : 'Members'],
    ['games', de ? 'Spiele' : 'Games'],
  ]

  async function test() {
    setBusy(true)
    setTooSoon(false)
    const r = await runDonorBot()
    setBusy(false)
    if (!r) return setTooSoon(true)
    setBot(r)
    void reloadClanDonors()
  }

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-lg font-bold text-white">CYN Bot</h3>
        {bot.configured && (
          <button type="button" onClick={() => void test()} disabled={busy} className="btn-ghost !px-3 !py-1.5 text-xs disabled:opacity-50">
            {busy ? '…' : de ? 'Jetzt ausführen' : 'Run now'}
          </button>
        )}
      </div>
      {!bot.configured ? (
        <p className="text-sm text-slate-400">
          {de
            ? 'Nicht eingerichtet: Es fehlt das Login-Cookie des Bot-Accounts (Worker-Secret OPENFRONT_BOT_COOKIE, siehe docs/donor-bot.md).'
            : 'Not set up: the login cookie of the bot account is missing (Worker secret OPENFRONT_BOT_COOKIE, see docs/donor-bot.md).'}
        </p>
      ) : !bot.last ? (
        <p className="text-sm text-slate-400">{de ? 'Eingerichtet, noch kein Lauf. Er läuft alle 30 Minuten (Minute 5 und 35).' : 'Set up, no run yet. It runs every 30 minutes (minute 5 and 35).'}</p>
      ) : (
        <>
          <p className={`text-sm font-semibold ${bot.last.ok ? 'text-signal-green' : 'text-signal-red'}`}>
            {de ? 'Letzter Lauf ' : 'Last run '}
            {when(bot.last.at)} {bot.last.ok ? '✓' : `– ${reason(bot.last.message)}`}
          </p>
          {bot.last.parts && (
            <ul className="space-y-1 text-xs">
              {parts.map(([key, label]) => {
                const v = bot.last?.parts?.[key]
                if (v == null) return null
                return (
                  <li key={key} className="flex gap-2">
                    <span className="w-24 shrink-0 text-slate-400">{label}</span>
                    <span className={v === 'ok' ? 'text-signal-green' : 'text-signal-red'}>{v === 'ok' ? 'OK' : reason(v)}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}
      {tooSoon && <p className="text-xs text-slate-500">{de ? 'Bitte eine Minute warten, dann noch einmal.' : 'Please wait a minute and try again.'}</p>}
    </Card>
  )
}
