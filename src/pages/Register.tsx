import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CLAN_TAG } from '../config'
import { hasBackend, saveProfile, saveLocalProfile, clearLocalProfile, getRemembered, fetchByDiscord } from '../lib/profiles'
import { supabase } from '../lib/supabase'
import { useProfile } from '../lib/useProfile'
import { useSession, discordDisplayName, discordUserId } from '../lib/useSession'
import { fetchPlayerGames } from '../lib/openfront'
import { COUNTRIES, countryName } from '../lib/countries'
import { Flag } from '../components/Emoji'
import { Card, SectionHeading, Spinner } from '../components/ui'
import { useLanguage } from '../i18n/LanguageContext'

const TIMEZONES = ['EU', 'America', 'Middle East', 'Asia']

function guessTz(): string {
  const off = -new Date().getTimezoneOffset() / 60
  if (off <= -1) return 'America'
  if (off >= 5) return 'Asia'
  if (off >= 2) return 'Middle East'
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
  const { t } = useLanguage()

  const remembered = getRemembered()
  const [name, setName] = useState(profile?.in_game_name ?? remembered.in_game_name ?? '')
  const [timezone, setTimezone] = useState(profile?.timezone ?? remembered.timezone ?? guessTz())
  const [openfrontId, setOpenfrontId] = useState(profile?.openfront_id ?? remembered.openfront_id ?? '')
  const [nationality, setNationality] = useState(profile?.nationality ?? remembered.nationality ?? '')
  const [natQuery, setNatQuery] = useState('')
  const [natOpen, setNatOpen] = useState(false)
  const natRef = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!natOpen) return
    function onDoc(e: MouseEvent) {
      if (natRef.current && !natRef.current.contains(e.target as Node)) setNatOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [natOpen])

  // This page also loads inside the Discord-login popup opened above (same
  // redirectTo). Once a session lands here, its own Supabase client has
  // already broadcast it to the main tab (same-origin BroadcastChannel, see
  // the popup comment above) - nothing left for this window to do but get
  // out of the way so the member lands back on the main tab they started on.
  useEffect(() => {
    if (window.opener && session) window.close()
  }, [session])

  const natMatches = natQuery.trim()
    ? COUNTRIES.filter(
        (c) => c.code.toLowerCase().startsWith(natQuery.trim().toLowerCase()) || c.name.toLowerCase().includes(natQuery.trim().toLowerCase()),
      ).slice(0, 8)
    : []

  // On sign-in, recover any existing registration (keyed by Discord name) from
  // the backend so the OpenFront id / details come back automatically. Falls
  // back to the Discord display name for a brand-new member.
  useEffect(() => {
    if (!session) return
    let alive = true
    ;(async () => {
      // Falls back to the Discord name unconditionally on any failure here
      // (a bad/missing lookup should never leave the field silently empty).
      let existing = null
      const lookupName = discordDisplayName(session)
      try {
        existing = await fetchByDiscord(lookupName)
      } catch (err) {
        // Temporary - tracking down a report of staying stuck on
        // RegistrationGate after a fresh Discord sign-in despite an
        // existing registration. Safe to remove once confirmed fixed.
        console.info('[register] fetchByDiscord threw', { lookupName, err })
        existing = null
      }
      console.info('[register] recovery effect', { lookupName, found: !!existing, alive })
      if (!alive) return
      if (existing) {
        setName((n) => n || existing.in_game_name)
        setOpenfrontId((v) => v || existing.openfront_id)
        if (existing.timezone) setTimezone((tz) => tz || existing.timezone)
        if (existing.nationality) setNationality((nat) => nat || existing.nationality!)
        // Restores the LOCAL profile immediately on a successful sign-in for
        // an already-registered member, without waiting for them to submit
        // the form again - this used to only pre-fill the form fields above,
        // which meant signing out (clears the local profile - see the
        // sign-out button below) and back in with Discord left an existing
        // member stuck on every other page's RegistrationGate ("Members
        // only - one quick step") until they noticed and clicked "Update
        // Registration" themselves. Local-only (no Supabase round-trip) -
        // nothing about their registration actually changed, just restoring
        // what sign-out cleared.
        const savedOk = saveLocalProfile(existing)
        refresh()
        console.info('[register] restored local profile', { existing, savedOk })
        // A blocked/restricted browser storage setting (confirmed directly:
        // Opera GX) means this can silently fail every single time, with
        // the visible symptom being "stuck on RegistrationGate no matter
        // what" and nothing in the UI ever explaining why - surfaced here
        // instead of only in the console.
        if (!savedOk) setError(t.register.storageBlocked)
        // Backfills discord_user_id for members who registered before it was
        // tracked (needed by the Discord role-sync bot) - silent and
        // automatic the next time they sign in here, no re-registration
        // needed. Best-effort: a failure here shouldn't block the page.
        if (!existing.discord_user_id) {
          const id = discordUserId(session)
          if (id) saveProfile({ ...existing, discord_user_id: id }).catch(() => {})
        }
      } else {
        setName((n) => n || discordDisplayName(session))
      }
    })()
    return () => {
      alive = false
    }
  }, [session, refresh, t])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const id = openfrontId.trim()
      // OpenFront's own clan-member list needs a logged-in OpenFront session
      // to query (401 without one) - there's no way to check current
      // membership directly. The closest public signal: since a recent
      // OpenFront patch, the [CYN] tag can only appear on a game if the
      // player was actually in the clan when they played it (no more
      // spoofing), so a recent CYN-tagged game is good evidence of real
      // membership. Only gates a brand-new registration - an existing
      // member editing their settings (timezone, etc) shouldn't get locked
      // out just because they haven't played recently.
      if (!profile) {
        if (!nationality) {
          setError(t.register.nationalityRequired)
          setBusy(false)
          return
        }
        const recentGames = await fetchPlayerGames(id, 3)
        if (!recentGames.some((g) => g.clanTag === CLAN_TAG)) {
          setError(t.register.notClanMember(CLAN_TAG))
          setBusy(false)
          return
        }
      }
      const { localSaveOk } = await saveProfile({
        in_game_name: name.trim(),
        timezone,
        openfront_id: id,
        discord_username: session ? discordDisplayName(session) : undefined,
        // Falls back to whatever was already known (profile.discord_user_id)
        // if this particular session lookup comes up empty - a submit here
        // must never erase an ID the earlier sign-in backfill already
        // captured just because this specific read failed.
        discord_user_id: (session ? discordUserId(session) : null) ?? profile?.discord_user_id ?? undefined,
        nationality: nationality || undefined,
      })
      refresh()
      // Navigating away when the local save failed would just bounce the
      // member straight back to this same RegistrationGate with nothing
      // explaining why (their registration DID save to Supabase - this is
      // purely about THIS browser remembering it) - shown as an error
      // instead of silently proceeding. See saveLocalProfile's own comment.
      if (!localSaveOk) {
        setError(t.register.storageBlocked)
        return
      }
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : t.register.somethingWrong)
    } finally {
      setBusy(false)
    }
  }

  const backHome = (
    <Link to="/" className="mb-6 inline-block text-sm text-slate-400 hover:text-accent-light">
      {t.register.backToOverview}
    </Link>
  )

  // ── Discord verification step - only for NEW sign-ups. Someone who already
  // has a profile goes straight to the settings form (edit details / sign out),
  // so the gear never forces a re-login just to change a field. ──
  if (hasBackend && !profile && session === undefined) {
    return (
      <div className="mx-auto max-w-xl">
        {backHome}
        <Spinner label={t.register.checkingSession} />
      </div>
    )
  }

  if (hasBackend && !profile && !session) {
    return (
      <div className="mx-auto max-w-xl">
        {backHome}
        <SectionHeading eyebrow={t.register.eyebrowMembers} title={t.register.titleJoin(CLAN_TAG)} />
        <Card className="py-10 text-center">
          <DiscordIcon className="mx-auto mb-3 h-10 w-10 text-[#5865F2]" />
          <h2 className="mb-1 text-lg font-semibold text-white">{t.register.verifyWithDiscord}</h2>
          <p className="mx-auto mb-6 max-w-sm text-sm text-slate-400">{t.register.discordIntro}</p>
          <button
            onClick={async () => {
              if (!supabase) return
              // Popup instead of navigating this tab away to Discord and back -
              // confirmed live to be necessary, not just nicer UX: a full-page
              // redirect through Discord -> Supabase -> back to this exact URL
              // is a textbook "bounce" pattern (leave the site, brief stay
              // elsewhere, return within seconds) that some browsers'
              // anti-tracking storage protections treat as suspicious and
              // silently wipe storage for, discarding a perfectly valid login -
              // reproduced directly (both the PKCE code-verifier and, later,
              // Supabase's own session itself going missing right after this
              // exact redirect chain, on a browser where it worked fine outside
              // that pattern). Keeping THIS tab on cynclan.com the whole time
              // and running the Discord round-trip in a separate popup avoids
              // the pattern entirely - Supabase's own BroadcastChannel-based
              // cross-tab session sync (same origin, so it reaches the popup
              // too) picks up the popup's session automatically once it signs
              // in, no manual message-passing needed.
              const { data, error } = await supabase.auth.signInWithOAuth({
                provider: 'discord',
                options: { redirectTo: `${window.location.origin}/register`, scopes: 'identify', skipBrowserRedirect: true },
              })
              if (error || !data?.url) return
              const popup = window.open(data.url, 'discord-oauth', 'width=480,height=720')
              // Popup blocked (rare for a direct click handler, but possible) -
              // fall back to the old full-tab redirect rather than doing nothing.
              if (!popup) window.location.href = data.url
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-[#5865F2] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#4752c4]"
          >
            <DiscordIcon className="h-4 w-4" /> {t.register.continueWithDiscord}
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
        eyebrow={profile ? t.register.eyebrowSettings : t.register.eyebrowMembers}
        title={profile ? t.register.titleYourProfile(CLAN_TAG) : t.register.titleJoin(CLAN_TAG)}
      />

      {session && (
        <p className="mb-4 text-sm text-signal-green">{t.register.signedInAs(discordDisplayName(session))}</p>
      )}
      {profile && (
        <div className="mb-5 rounded-lg border border-signal-green/30 bg-signal-green/10 px-4 py-3 text-sm text-signal-green">
          {t.register.registeredAs(profile.in_game_name)}
        </div>
      )}

      <Card>
        {!hasBackend && (
          <div className="mb-6 flex items-center gap-3 rounded-lg border border-base-600 bg-base-800/50 px-4 py-3">
            <DiscordIcon className="h-6 w-6 shrink-0 text-[#5865F2]" />
            <p className="text-xs text-slate-400">{t.register.backendNotConnected}</p>
          </div>
        )}

        <form className="space-y-5" onSubmit={onSubmit}>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-300">{t.register.inGameName}</label>
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
              <label className="mb-1.5 block text-sm font-medium text-slate-300">{t.register.timezone}</label>
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
              <label className="mb-1.5 block text-sm font-medium text-slate-300">{t.register.openfrontId}</label>
              <input
                required
                value={openfrontId}
                onChange={(e) => setOpenfrontId(e.target.value)}
                placeholder="e.g. oCOTVIG9"
                className="w-full rounded-lg border border-base-600 bg-base-800 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-accent focus:outline-none"
              />
            </div>
          </div>
          <p className="-mt-2 text-xs text-slate-500">{t.register.findIdHelp}</p>

          <div className="relative" ref={natRef}>
            <label className="mb-1.5 block text-sm font-medium text-slate-300">{t.register.nationality}</label>
            <div className="flex items-center gap-2 rounded-lg border border-base-600 bg-base-800 px-3.5 py-2.5 focus-within:border-accent">
              {nationality && !natOpen && <Flag code={nationality} className="h-4 w-6 shrink-0" />}
              <input
                value={natOpen ? natQuery : countryName(nationality) ?? ''}
                onChange={(e) => {
                  setNatQuery(e.target.value)
                  setNatOpen(true)
                }}
                onFocus={() => {
                  setNatQuery('')
                  setNatOpen(true)
                }}
                placeholder={t.register.nationalityPlaceholder}
                className="w-full bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none"
              />
              {nationality && (
                <button
                  type="button"
                  aria-label={t.register.nationalityClear}
                  onClick={() => {
                    setNationality('')
                    setNatQuery('')
                  }}
                  className="shrink-0 text-slate-500 hover:text-slate-300"
                >
                  ×
                </button>
              )}
            </div>
            {natOpen && natMatches.length > 0 && (
              <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-base-600 bg-base-800 shadow-xl">
                {natMatches.map((c) => (
                  <button
                    type="button"
                    key={c.code}
                    onClick={() => {
                      setNationality(c.code)
                      setNatQuery('')
                      setNatOpen(false)
                    }}
                    className="flex w-full items-center gap-2 px-3.5 py-2 text-left text-sm text-slate-200 hover:bg-base-700"
                  >
                    <Flag code={c.code} className="h-4 w-6 shrink-0" />
                    <span>{c.name}</span>
                    <span className="ml-auto text-xs text-slate-500">{c.code}</span>
                  </button>
                ))}
              </div>
            )}
            <p className="mt-1.5 text-xs text-slate-500">{t.register.nationalityHelp}</p>
          </div>

          {error && <p className="text-sm text-signal-red">{error}</p>}

          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={busy} className="btn-accent disabled:opacity-60">
              {busy ? t.register.saving : profile ? t.register.updateRegistration : t.register.registerAndView}
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
                {t.accountMenu.signOut}
              </button>
            )}
          </div>
        </form>
      </Card>
    </div>
  )
}
