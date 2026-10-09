import { useEffect, useState } from 'react'
import { fetchSession, SESSION_EVENT, type Session } from './db'
import { isEventAdmin } from './events'
import { completeDiscordSignIn } from './discordAuth'

// ── Shared session singleton ────────────────────────────────────────────────
// useSession() is called from many places at once on a single page (Layout's AccountMenu, useProfile()'s own
// recovery effect, pages like Register.tsx). They all share ONE session request and one listener list, so no
// component can end up with a different answer than the others.
let cachedSession: Session | null | undefined = undefined
let initStarted = false
const listeners = new Set<(s: Session | null | undefined) => void>()

function notifyAll(s: Session | null | undefined) {
  cachedSession = s
  for (const l of listeners) l(s)
}

function ensureInitialized() {
  if (initStarted) return
  initStarted = true
  // If this page is the redirect target after a Discord sign-in, tidy the URL first; the session cookie is
  // already set by then, so the request below sees the signed-in state.
  completeDiscordSignIn().finally(() => {
    fetchSession().then(notifyAll)
  })
  window.addEventListener(SESSION_EVENT, () => {
    fetchSession().then(notifyAll)
  })
}

/** undefined while the initial session loads, null when signed out. */
export function useSession() {
  const [session, setSession] = useState<Session | null | undefined>(cachedSession)

  useEffect(() => {
    ensureInitialized()
    // Catches up if cachedSession already resolved before this component mounted.
    setSession(cachedSession)
    listeners.add(setSession)
    return () => {
      listeners.delete(setSession)
    }
  }, [])

  return session
}

/**
 * The session's user_metadata mirrors what Discord returns (full_name = the raw unique username).
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

/**
 * Discord's real snowflake user ID - needed only for the Discord role-sync
 * bot (scripts/discord-role-sync.mjs), which has to call
 * `.../guilds/{guild}/members/{user_id}/roles/{role_id}` and cannot use the
 * free-text display name discordDisplayName() returns. `identities[].id` is
 * Supabase's documented provider-supplied identity ID (the most reliable
 * source); user_metadata.provider_id/sub are defensive fallbacks in case
 * `identities` isn't populated on this particular session object. Returns
 * null rather than throwing, same defensive style as discordDisplayName -
 * a member simply doesn't get Discord roles synced until this succeeds.
 */
export function discordUserId(session: Session): string | null {
  const identity = session.user.identities?.find((i) => i.provider === 'discord')
  if (identity?.id) return identity.id
  const m = session.user.user_metadata ?? {}
  return (m.provider_id as string | undefined) || (m.sub as string | undefined) || null
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
