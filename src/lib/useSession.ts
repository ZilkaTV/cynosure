import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { isEventAdmin } from './events'

/** undefined while the initial session loads, null when signed out. */
export function useSession() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)

  useEffect(() => {
    if (!supabase) {
      setSession(null)
      return
    }
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => listener.subscription.unsubscribe()
  }, [])

  return session
}

/**
 * Discord OAuth via Supabase doesn't always populate the same metadata key.
 * full_name is Supabase's own mapping of Discord's raw, unique "username"
 * field (e.g. "zjlka") - confirmed from Supabase auth's Go source, where
 * FullName is set to u.Name straight from Discord's username JSON field.
 * custom_claims.global_name is Discord's newer, changeable display name
 * (e.g. "Zilka") and must NOT be checked first, since anything stored
 * elsewhere (cyn_event_admins, registered profiles) uses the raw username.
 * user_metadata itself can also be missing entirely right after the OAuth
 * redirect, before a session refresh fills it in - guard against that too,
 * since reading a field off `undefined` would throw and silently break the
 * register form's name auto-fill (the effect calling this never gets to set
 * anything, leaving the field empty).
 */
export function discordDisplayName(session: Session): string {
  const m = session.user.user_metadata ?? {}
  const claims = (m.custom_claims ?? {}) as Record<string, unknown>
  return (
    m.full_name ||
    m.name ||
    m.preferred_username ||
    m.user_name ||
    m.username ||
    (claims.global_name as string | undefined) ||
    'Player'
  )
}

/** Whether the signed-in visitor is a whitelisted site admin (cyn_event_admins). */
export function useIsAdmin(): boolean {
  const session = useSession()
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    if (!session) {
      setIsAdmin(false)
      return
    }
    let alive = true
    isEventAdmin(discordDisplayName(session)).then((result) => {
      if (alive) setIsAdmin(result)
    })
    return () => {
      alive = false
    }
  }, [session])

  return isAdmin
}
