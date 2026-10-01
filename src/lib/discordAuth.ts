// Custom Discord sign-in, replacing Supabase's own built-in Discord OAuth
// provider everywhere on this site (see worker/discord-auth.js's own top
// comment for the full reasoning - short version: Supabase's managed
// Discord provider always requests the `email` scope from Discord's consent
// screen regardless of the `scopes` option passed to signInWithOAuth(),
// with no dashboard setting to turn that off, and nothing on this site ever
// reads a signed-in visitor's email).

import { supabase } from './supabase'

// Public Client ID (safe to embed client-side - it's the same value Discord
// itself puts in the authorize URL a browser is sent to) - kept in sync
// with worker/discord-auth.js's own copy. The real secret
// (DISCORD_CLIENT_SECRET) only ever lives in that Worker's own env, never
// here.
const DISCORD_CLIENT_ID = '1525830274741571664'
const DISCORD_REDIRECT_URI = 'https://cynclan.com/api/auth/discord/callback'

/** Every page with a Discord sign-in button - see ALLOWED_REDIRECT_PATHS in worker/discord-auth.js (keep both lists in sync). */
export type DiscordSignInTarget = '/register' | '/survey'

// Anti-CSRF (login-CSRF) nonce for the OAuth round-trip. Before this, `state`
// was just the target path - no per-attempt secret - so a classic login-CSRF
// was possible: an attacker starts their OWN Discord sign-in, captures the
// resulting `code` (never used, since they don't need to complete their own
// flow), and sends a victim a crafted callback link using that code. Our
// Worker would exchange it and mint a REAL session - for the attacker's
// Discord identity - and the victim's browser would complete it, ending up
// signed in as someone else without realizing it (then submitting event
// entries, chat messages etc. under that identity). The Worker mints the
// session server-side regardless (it has no way to know who's about to land
// on the callback), so the fix has to happen on THIS side: the browser only
// finishes the sign-in (calls verifyOtp) if the nonce the callback echoes
// back matches the one THIS browser generated before leaving for Discord -
// an attacker-initiated flow's nonce will never match what's in the
// victim's own sessionStorage.
const NONCE_STORAGE_KEY = 'cyn:discordOAuthNonce'

/** Sends the browser straight to Discord's own consent screen, requesting ONLY `identify` (no email). */
export function startDiscordSignIn(targetPath: DiscordSignInTarget) {
  const nonce = crypto.randomUUID()
  try {
    sessionStorage.setItem(NONCE_STORAGE_KEY, nonce)
  } catch {
    // sessionStorage can throw in a locked-down browser context (private
    // mode with storage blocked, etc.) - completeDiscordSignIn treats a
    // missing stored nonce as a failed verification, same as it would for a
    // genuine CSRF attempt, so this just means sign-in won't complete there
    // rather than silently skipping the check.
  }
  const url = new URL('https://discord.com/oauth2/authorize')
  url.searchParams.set('client_id', DISCORD_CLIENT_ID)
  url.searchParams.set('redirect_uri', DISCORD_REDIRECT_URI)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'identify')
  url.searchParams.set('state', `${targetPath}|${nonce}`)
  window.location.href = url.toString()
}

/**
 * Called once, early, from useSession.ts's ensureInitialized() - picks up
 * the hashed_token/email pair worker/discord-auth.js's redirect leaves in
 * the URL after a completed Discord sign-in, and exchanges it for a real
 * Supabase session via the standard OTP-verification path (the same
 * mechanism a magic-link email sign-in would use, just never actually
 * emailed to anyone - see that Worker file's own comment for the full
 * reasoning). Stripped from the URL immediately, before the exchange even
 * resolves, so a page refresh or back-navigation can't replay the same
 * (single-use) token.
 */
export async function completeDiscordSignIn(): Promise<void> {
  if (!supabase) return
  const params = new URLSearchParams(window.location.search)
  const tokenHash = params.get('discord_token_hash')
  const returnedNonce = params.get('discord_state_nonce')
  const authError = params.get('discord_auth_error')
  if (!tokenHash && !authError) return

  params.delete('discord_token_hash')
  params.delete('discord_state_nonce')
  params.delete('discord_auth_error')
  const newSearch = params.toString()
  window.history.replaceState({}, '', window.location.pathname + (newSearch ? `?${newSearch}` : '') + window.location.hash)

  if (authError) {
    console.error('[auth] Discord sign-in failed:', authError)
    return
  }
  if (!tokenHash) return

  // Anti-CSRF check - see startDiscordSignIn's own comment on
  // NONCE_STORAGE_KEY for the attack this stops. Read-then-remove
  // regardless of outcome: this nonce is for exactly one sign-in attempt,
  // win or lose, so it can't be reused if this check fails and somehow runs
  // again.
  let storedNonce = null
  try {
    storedNonce = sessionStorage.getItem(NONCE_STORAGE_KEY)
    sessionStorage.removeItem(NONCE_STORAGE_KEY)
  } catch {
    // see startDiscordSignIn's own try/catch - a storage access failure
    // here just means storedNonce stays null, which already fails closed
    // below.
  }
  if (!storedNonce || !returnedNonce || storedNonce !== returnedNonce) {
    console.error('[auth] Discord sign-in rejected: state nonce mismatch (possible CSRF, or sign-in started in a different tab/browser)')
    return
  }

  // 'magiclink' (what generateLink used to CREATE this token - see
  // worker/discord-auth.js) is a different, now-deprecated type value on
  // THIS (verifyOtp) side - Supabase's own docs show 'email' as the current
  // type for token_hash verification regardless of which link type minted
  // it. And per Supabase's VerifyTokenHashParams type, `email` must NOT be
  // passed alongside token_hash - confirmed live, the server rejected it
  // outright with "Only the token_hash and type should be provided" (a
  // 400), which is what was actually keeping every sign-in stuck on the
  // signed-out card, not the type value.
  const { error } = await supabase.auth.verifyOtp({ type: 'email', token_hash: tokenHash })
  if (error) console.error('[auth] Discord sign-in verification failed:', error)
}
