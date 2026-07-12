import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CLAN_TAG } from '../config'
import { hasBackend, saveProfile, clearLocalProfile, getRemembered, fetchByDiscord } from '../lib/profiles'
import { supabase } from '../lib/supabase'
import { useProfile } from '../lib/useProfile'
import { useSession, discordDisplayName } from '../lib/useSession'
import { Card, SectionHeading, Spinner } from '../components/ui'

const TIMEZONES = ['EU', 'America', 'Asia']

function guessTz(): string {
  const off = -new Date().getTimezoneOffset() / 60
  if (off <= -1) return 'America'
  if (off >= 5) return 'Asia'
  return 'EU'
}

const DiscordIcon = ({ className = 'h-5 w-5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M20.317 4.369A19.79 19.79 0 0 0 15.885 3c-.213.38-.462.893-.634 1.301a18.27 18.27 0 0 0-5.5 0A12.6 12.6 0 0 0 9.115 3a19.74 19.74 0 0 0-4.435 1.371C1.4 9.043.65 13.6.925 18.096a19.9 19.9 0 0 0 6.06 3.06c.49-.665.926-1.372 1.302-2.115a12.9 12.9 0 0 1-2.049-.98c.172-.125.34-.256.503-.392a14.19 14.19 0 0 0 12.516 0c.166.14.334.27.503.392-.65.385-1.336.71-2.052.982.377.742.812 1.45 1.303 2.114a19.83 19.83 0 0 0 6.064-3.06c.323-5.218-.552-9.735-2.758-13.727ZM8.68 15.331c-1.017 0-1.85-.933-1.85-2.081 0-1.148.815-2.082 1.85-2.082 1.044 0 1.867.943 1.85 2.082 0 1.148-.815 2.081-1.85 2.081Zm6.646 0c-1.017 0-1.85-.933-1.85-2.081 0-1.148.815-2.082 1.85-2.082 1.044 0 1.867.943 1.85 2.082 0 1.148-.806 2.081-1.85 2.081Z" />
  </svg>
)

export default function Register() {
  const navigate = useNavigate()
  const { profile, refresh } = useProfile()
  const session = useSession()

  const remembered = getRemembered()
  const [name, setName] = useState(profile?.in_game_name ?? remembered.in_game_name ?? '')
  const [timezone, setTimezone] = useState(profile?.timezone ?? remembered.timezone ?? guessTz())
  const [openfrontId, setOpenfrontId] = useState(profile?.openfront_id ?? remembered.openfront_id ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // On sign-in, recover any existing registration (keyed by Discord name) from
  // the backend so the OpenFront id / details come back automatically. Falls
  // back to the Discord display name for a brand-new member.
  useEffect(() => {
    if (!session) return
    let alive = true
    ;(async () => {
      const existing = await fetchByDiscord(discordDisplayName(session)).catch(() => null)
      if (!alive) return
      if (existing) {
        setName((n) => n || existing.in_game_name)
        setOpenfrontId((v) => v || existing.openfront_id)
        if (existing.timezone) setTimezone((t) => t || existing.timezone)
      } else {
        setName((n) => n || discordDisplayName(session))
      }
    })()
    return () => {
      alive = false
    }
  }, [session])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await saveProfile({
        in_game_name: name.trim(),
        timezone,
        openfront_id: openfrontId.trim(),
        discord_username: session ? discordDisplayName(session) : undefined,
      })
      refresh()
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  const backHome = (
    <Link to="/" className="mb-6 inline-block text-sm text-slate-400 hover:text-accent-light">
      ← Back to overview
    </Link>
  )

  // ── Discord verification step - only for NEW sign-ups. Someone who already
  // has a profile goes straight to the settings form (edit details / sign out),
  // so the gear never forces a re-login just to change a field. ──
  if (hasBackend && !profile && session === undefined) {
    return (
      <div className="mx-auto max-w-xl">
        {backHome}
        <Spinner label="Checking your session…" />
      </div>
    )
  }

  if (hasBackend && !profile && !session) {
    return (
      <div className="mx-auto max-w-xl">
        {backHome}
        <SectionHeading eyebrow="Members" title={`Join the [${CLAN_TAG}] roster`} />
        <Card className="py-10 text-center">
          <DiscordIcon className="mx-auto mb-3 h-10 w-10 text-[#5865F2]" />
          <h2 className="mb-1 text-lg font-semibold text-white">Verify with Discord</h2>
          <p className="mx-auto mb-6 max-w-sm text-sm text-slate-400">
            Sign in with Discord first. Then you’ll enter your in-game name, timezone and OpenFront public id.
          </p>
          <button
            onClick={() =>
              supabase?.auth.signInWithOAuth({
                provider: 'discord',
                options: { redirectTo: `${window.location.origin}/register` },
              })
            }
            className="inline-flex items-center gap-2 rounded-lg bg-[#5865F2] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#4752c4]"
          >
            <DiscordIcon className="h-4 w-4" /> Continue with Discord
          </button>
        </Card>
      </div>
    )
  }

  // ── Details form (signed in, or backend not configured yet) ────────────────
  return (
    <div className="mx-auto max-w-xl">
      {backHome}
      <SectionHeading
        eyebrow={profile ? 'Settings' : 'Members'}
        title={profile ? `Your [${CLAN_TAG}] profile` : `Join the [${CLAN_TAG}] roster`}
      />

      {session && (
        <p className="mb-4 text-sm text-signal-green">✓ Signed in as {discordDisplayName(session)}</p>
      )}
      {profile && (
        <div className="mb-5 rounded-lg border border-signal-green/30 bg-signal-green/10 px-4 py-3 text-sm text-signal-green">
          ✓ You’re registered as <strong>{profile.in_game_name}</strong>. Editing below updates your entry.
        </div>
      )}

      <Card>
        {!hasBackend && (
          <div className="mb-6 flex items-center gap-3 rounded-lg border border-base-600 bg-base-800/50 px-4 py-3">
            <DiscordIcon className="h-6 w-6 shrink-0 text-[#5865F2]" />
            <p className="text-xs text-slate-400">
              Discord verification activates once the site’s Supabase backend is connected. For now, just fill
              in your details below.
            </p>
          </div>
        )}

        <form className="space-y-5" onSubmit={onSubmit}>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-300">In-game name</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Bane"
              className="w-full rounded-lg border border-base-600 bg-base-800 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-accent focus:outline-none"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">Timezone</label>
              <select
                required
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full rounded-lg border border-base-600 bg-base-800 px-3.5 py-2.5 text-sm text-white focus:border-accent focus:outline-none"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">OpenFront public id</label>
              <input
                required
                value={openfrontId}
                onChange={(e) => setOpenfrontId(e.target.value)}
                placeholder="e.g. oCOTVIG9"
                className="w-full rounded-lg border border-base-600 bg-base-800 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-accent focus:outline-none"
              />
            </div>
          </div>
          <p className="-mt-2 text-xs text-slate-500">
            Find your public id in OpenFront under your profile - it’s the code in your player URL.
          </p>

          {error && <p className="text-sm text-signal-red">{error}</p>}

          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={busy} className="btn-accent disabled:opacity-60">
              {busy ? 'Saving…' : profile ? 'Update registration' : 'Register & view stats'}
            </button>
            {(profile || session) && (
              <button
                type="button"
                onClick={async () => {
                  clearLocalProfile()
                  if (supabase) await supabase.auth.signOut()
                  refresh()
                }}
                className="btn-ghost"
              >
                Sign out
              </button>
            )}
          </div>
        </form>
      </Card>
    </div>
  )
}
