import { useCallback, useEffect, useState } from 'react'
import { getLocalProfile, saveLocalProfile, fetchByDiscord, PROFILE_EVENT, type Profile } from './profiles'
import { useSession, discordDisplayName } from './useSession'

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
    if (!session || profile) return
    let alive = true
    fetchByDiscord(discordDisplayName(session))
      .then((existing) => {
        if (!alive || !existing) return
        saveLocalProfile(existing)
        setProfile(existing)
      })
      .catch(() => {
        /* best-effort - a failed lookup just leaves the gate showing, same as before this fix existed */
      })
    return () => {
      alive = false
    }
  }, [session, profile])

  return { profile, refresh }
}
