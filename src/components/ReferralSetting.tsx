import { useMemo, useState } from 'react'
import { useLanguage } from '../i18n/LanguageContext'
import { useSharedRoster } from '../lib/access'
import { cleanDisplayName } from '../lib/displayName'
import { setReferrer, useReferral } from '../lib/referrals'
import { useProfile } from '../lib/useProfile'

const ERRORS = {
  de: {
    not_yourself: 'Du kannst dich nicht selbst wählen.',
    already_set: 'Du hast schon jemanden gewählt. Das lässt sich nicht mehr ändern.',
    circular: 'Diese Person hat dich schon als Werber gewählt.',
    unknown_member: 'Diese Person hat kein Profil auf der Seite.',
    failed: 'Das hat nicht geklappt. Versuch es gleich noch einmal.',
  },
  en: {
    not_yourself: 'You cannot pick yourself.',
    already_set: 'You already picked somebody. It cannot be changed any more.',
    circular: 'This person already named you as the one who brought them.',
    unknown_member: 'This person has no profile on the site.',
    failed: 'That did not work. Try again in a moment.',
  },
} as const

/** Settings: optionally name the member who brought you to the site (once; it cannot be changed, and not yourself). They get a booster for it. */
export default function ReferralSetting() {
  const { language } = useLanguage()
  const de = language === 'de'
  const { profile } = useProfile()
  const roster = useSharedRoster()
  const { state, reload } = useReferral(!!profile)
  const [text, setText] = useState('')
  const [confirm, setConfirm] = useState<{ id: string; name: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const candidates = useMemo(
    () =>
      (roster?.members ?? [])
        .filter((m) => m.claimed && m.publicId !== profile?.openfront_id)
        .map((m) => ({ id: m.publicId, name: cleanDisplayName(m.name) }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [roster, profile?.openfront_id],
  )
  if (!profile) return null

  const find = () => {
    const q = text.trim().toLowerCase()
    return candidates.find((c) => c.name.toLowerCase() === q || c.id.toLowerCase() === q) ?? null
  }

  async function save() {
    if (!confirm) return
    setBusy(true)
    const problem = await setReferrer(confirm.id)
    setBusy(false)
    setConfirm(null)
    setMessage(problem ? ERRORS[de ? 'de' : 'en'][problem as keyof (typeof ERRORS)['de']] ?? ERRORS[de ? 'de' : 'en'].failed : de ? 'Gespeichert. Danke!' : 'Saved. Thank you!')
    reload()
  }

  return (
    <div className="panel mx-auto mb-6 max-w-xl space-y-2 p-5">
      <h3 className="font-display text-lg font-bold text-white">{de ? 'Geworben von (optional)' : 'Brought here by (optional)'}</h3>
      {state === null ? (
        <p className="text-sm text-slate-500">…</p>
      ) : state.referrer ? (
        <p className="text-sm text-slate-300">
          {de ? 'Du wurdest geworben von' : 'You were brought here by'} <span className="font-semibold text-white">{cleanDisplayName(state.referrer.name ?? state.referrer.id)}</span>. {de ? 'Das lässt sich nicht mehr ändern.' : 'This cannot be changed any more.'}
        </p>
      ) : (
        <>
          <p className="text-sm text-slate-400">
            {de
              ? 'Hat dich ein Mitglied auf die Seite geholt? Trag den Namen ein: Dieses Mitglied bekommt dafür einen Booster. Du kannst nur einen Namen wählen, danach lässt es sich nicht mehr ändern, und dich selbst kannst du nicht wählen.'
              : 'Did a member bring you to the site? Enter their name: they get a booster for it. You can pick one name only, it cannot be changed afterwards, and you cannot pick yourself.'}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              list="referral-members"
              value={text}
              onChange={(e) => {
                setText(e.target.value)
                setConfirm(null)
                setMessage(null)
              }}
              placeholder={de ? 'Name des Mitglieds' : 'Name of the member'}
              className="min-w-0 flex-1 rounded-lg border border-base-600 bg-base-800 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-accent focus:outline-none"
            />
            <datalist id="referral-members">
              {candidates.map((c) => (
                <option key={c.id} value={c.name} />
              ))}
            </datalist>
            <button type="button" className="btn-ghost !px-4 !py-2 text-sm disabled:opacity-50" disabled={!find() || busy} onClick={() => setConfirm(find())}>
              {de ? 'Wählen' : 'Pick'}
            </button>
          </div>
          {text.trim() && !find() && <p className="text-xs text-slate-500">{de ? 'Kein Mitglied mit diesem Namen gefunden (nur Mitglieder mit Profil).' : 'No member with this name found (only members with a profile).'}</p>}
          {confirm && (
            <div className="rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 text-sm text-slate-200">
              <p>{de ? `${confirm.name} wirklich wählen? Das kannst du nicht mehr ändern.` : `Really pick ${confirm.name}? You cannot change this afterwards.`}</p>
              <div className="mt-2 flex gap-2">
                <button type="button" className="btn-accent !px-4 !py-1.5 text-sm disabled:opacity-50" disabled={busy} onClick={() => void save()}>
                  {busy ? '…' : de ? 'Ja, speichern' : 'Yes, save'}
                </button>
                <button type="button" className="btn-ghost !px-4 !py-1.5 text-sm" onClick={() => setConfirm(null)}>
                  {de ? 'Abbrechen' : 'Cancel'}
                </button>
              </div>
            </div>
          )}
        </>
      )}
      {message && <p className="text-sm text-slate-300">{message}</p>}
    </div>
  )
}
