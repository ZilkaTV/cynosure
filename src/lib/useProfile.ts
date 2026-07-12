import { useCallback, useEffect, useState } from 'react'
import { getLocalProfile, type Profile } from './profiles'

/** Current visitor's registration, if any. Drives the stats gate. */
export function useProfile() {
  const [profile, setProfile] = useState<Profile | null>(() => getLocalProfile())

  const refresh = useCallback(() => setProfile(getLocalProfile()), [])

  useEffect(() => {
    const onStorage = () => refresh()
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [refresh])

  return { profile, refresh }
}
