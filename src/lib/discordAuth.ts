// Discord sign-in. The browser is sent straight to Discord's consent screen, asking ONLY for `identify` (no email).
// Discord redirects back to the Worker (worker/discord-auth.js), which exchanges the code itself, sets the site's
// session cookie and redirects to the page the sign-in started on.

// Public Client ID (safe to embed client-side - it's the same value Discord itself puts in the authorize URL).
// Kept in sync with worker/discord-auth.js. The real secret (DISCORD_CLIENT_SECRET) only ever lives in the Worker.
const DISCORD_CLIENT_ID = '1525830274741571664'
const DISCORD_REDIRECT_URI = 'https://cynclan.com/api/auth/discord/callback'

/** Every page with a Discord sign-in button - see ALLOWED_REDIRECT_PATHS in worker/discord-auth.js (keep both lists in sync). */
export type DiscordSignInTarget = '/register' | '/survey'

/**
 * Anti login-CSRF: a random nonce goes into the OAuth `state` AND into a short-lived cookie of this browser. The
 * Worker only issues a session if both match, so a callback link built from someone else's Discord code (which
 * can't also set our cookie) is refused.
 */
export function startDiscordSignIn(targetPath: DiscordSignInTarget) {
  const nonce = crypto.randomUUID()
  document.cookie = `cyn_oauth_nonce=${nonce}; Max-Age=600; Path=/api/auth; SameSite=Lax; Secure`
  const url = new URL('https://discord.com/oauth2/authorize')
  url.searchParams.set('client_id', DISCORD_CLIENT_ID)
  url.searchParams.set('redirect_uri', DISCORD_REDIRECT_URI)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'identify')
  url.searchParams.set('state', `${targetPath}|${nonce}`)
  window.location.href = url.toString()
}

/**
 * Called once, early, from useSession.ts: removes the marker parameters the Worker leaves in the URL after a
 * sign-in attempt, so a refresh doesn't keep them. The session itself is already in the cookie by then.
 */
export async function completeDiscordSignIn(): Promise<void> {
  const params = new URLSearchParams(window.location.search)
  const authError = params.get('discord_auth_error')
  if (!params.has('discord_signed_in') && !authError) return
  params.delete('discord_signed_in')
  params.delete('discord_auth_error')
  const newSearch = params.toString()
  window.history.replaceState({}, '', window.location.pathname + (newSearch ? `?${newSearch}` : '') + window.location.hash)
  if (authError) console.error('[auth] Discord sign-in failed:', authError)
}
