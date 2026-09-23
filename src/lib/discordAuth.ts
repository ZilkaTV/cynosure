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

/** Sends the browser straight to Discord's own consent screen, requesting ONLY `identify` (no email). */
export function startDiscordSignIn(targetPath: DiscordSignInTarget) {
  const url = new URL('https://discord.com/oauth2/authorize')
  url.searchParams.set('client_id', DISCORD_CLIENT_ID)
  url.searchParams.set('redirect_uri', DISCORD_REDIRECT_URI)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'identify')
  url.searchParams.set('state', targetPath)
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
  const authError = params.get('discord_auth_error')
  if (!tokenHash && !authError) return

  params.delete('discord_token_hash')
  params.delete('discord_auth_error')
  const newSearch = params.toString()
  window.history.replaceState({}, '', window.location.pathname + (newSearch ? `?${newSearch}` : '') + window.location.hash)

  if (authError) {
    console.error('[auth] Discord sign-in failed:', authError)
    return
  }
  if (!tokenHash) return

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
