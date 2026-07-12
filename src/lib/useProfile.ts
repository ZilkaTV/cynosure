import { useCallback, useEffect, useState } from 'react'
import { getLocalProfile, PROFILE_EVENT, type Profile } from './profiles'

/** Current visitor's registration, if any. Drives the stats gate. */
export function useProfile() {
  const [profile, setProfile] = useState<Profile | null>(() => getLocalProfile())

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

  return { profile, refresh }
}
