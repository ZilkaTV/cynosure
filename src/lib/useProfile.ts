import { useCallback, useEffect, useState } from 'react'
import { getLocalProfile, saveLocalProfile, saveProfile, fetchByDiscord, PROFILE_EVENT, type Profile } from './profiles'
import { useSession, discordDisplayName, discordUserId } from './useSession'

/**
 * Current visitor's registration, if any. Drives the stats gate.
 *
 * Also the site's one central recovery path for an already-registered
 * member whose LOCAL profile is missing (freshly signed back in on some
 * OTHER page than /register, a browser that never persisted it, a cleared
 * profile after sign-out, etc.) - previously this restore only happened
 * inside Register.tsx's own mount effect, so landing anywhere else right
 * after a real Discord sign-in left a genuinely-registered member stuck on
 * every page's "Members Only" gate until they specifically visited
 * /register again. Runs here instead, since every gated page already calls
 * useProfile() - no page-specific fix needed ever again.
 *
 * Also backfills discord_user_id (needed by scripts/discord-role-sync.mjs
 * to grant Discord roles) the same way - previously only happened inside
 * Register.tsx's own effect too, so a member who never happened to revisit
 * /register after this field was added stayed permanently
 * "skippedNoDiscordId" in every role-sync run (confirmed live: ~20 of 30
 * registered members, every single run) even with a perfectly valid,
 * currently-signed-in session on every other page.
 */
export function useProfile() {
  const [profile, setProfile] = useState<Profile | null>(() => getLocalProfile())
  const session = useSession()

  const refresh = useCallback(() => setProfile(getLocalProfile()), [])

  useEffect(() => {
    // 'storage' → changes from other tabs; PROFILE_EVENT → changes in this tab.
    window.addEventListener('storage', refresh)
    window.addEventListener(PROFILE_EVENT, refresh)
    return () => {
      window.removeEventListener('storage', refresh)
      window.removeEventListener(PROFILE_EVENT, refresh)
    }
  }, [refresh])

  useEffect(() => {
    if (!session) return
    let alive = true
    ;(async () => {
      if (!profile) {
        const existing = await fetchByDiscord(discordDisplayName(session)).catch(() => null)
        if (!alive || !existing) return
        saveLocalProfile(existing)
        setProfile(existing)
        if (!existing.discord_user_id) {
          const id = discordUserId(session)
          if (id) saveProfile({ ...existing, discord_user_id: id }).catch(() => {})
        }
      } else if (!profile.discord_user_id) {
        const id = discordUserId(session)
        if (!id) return
        const updated = { ...profile, discord_user_id: id }
        saveLocalProfile(updated)
        setProfile(updated)
        saveProfile(updated).catch(() => {})
      }
    })()
    return () => {
      alive = false
    }
  }, [session, profile])

  return { profile, refresh }
}
