// Custom Discord sign-in, replacing Supabase's own built-in Discord OAuth
// provider (still used nowhere else on this site as of this file's
// creation). Supabase's managed Discord provider always requests
// `identify+email` from Discord's own consent screen regardless of the
// `scopes` option passed to `signInWithOAuth()` client-side - confirmed
// directly against a real login (the consent screen showed "access your
// email address" as a granted permission even with `scopes: 'identify'`
// requested) - and there is no dashboard setting to change that; it's fixed
// server-side in how Supabase's GoTrue talks to Discord. Nothing on this
// site ever reads a signed-in visitor's email, so that permission is asked
// for and granted for no reason.
//
// This handler exchanges Discord's OAuth code directly ourselves (requesting
// ONLY `identify`, see src/lib/discordAuth.ts for where the authorize URL is
// built), then mints a real Supabase session using the officially documented
// pattern for custom/unsupported OAuth providers: the Supabase ADMIN API's
// generateLink(type: 'magiclink') creates-or-finds a Supabase auth user tied
// to a synthetic, never-emailed "<discord id>@cynclan.invalid" address (the
// .invalid TLD is reserved by RFC 2606 for exactly this - an address that's
// guaranteed to never resolve or receive mail), and returns a hashed_token
// the BROWSER then exchanges itself via supabase.auth.verifyOtp() (see
// src/lib/discordAuth.ts) to get a normal, fully-valid Supabase session -
// nothing here ever touches or stores a service-role-authenticated session
// itself, only Supabase's own client SDK does, exactly as with every other
// sign-in path on this site.

import { createClient } from '@supabase/supabase-js'

// Public by design (a Discord OAuth Client ID is meant to be embedded in
// client-side code, same as it appears in the authorize URL a browser is
// sent to) - duplicated here and in src/lib/discordAuth.ts rather than
// threaded through env, same reasoning as every other small constant
// duplicated across this repo's separate build boundaries (CLAN_TAG,
// DISCORD_GUILD_ID, etc.). DISCORD_CLIENT_SECRET below is the real secret
// and is NOT duplicated - it only ever lives in this Worker's own env.
const DISCORD_CLIENT_ID = '1525830274741571664'
const DISCORD_REDIRECT_URI = 'https://cynclan.com/api/auth/discord/callback'

// Only ever redirect back to a known page on this same site - `state` is
// visitor-controlled (it's a URL query param on the Discord redirect), so
// treating it as an arbitrary redirect target would make this an open
// redirect. Extend this list if another page grows its own Discord sign-in
// button.
const ALLOWED_REDIRECT_PATHS = new Set(['/register', '/survey'])

function errorRedirect(targetPath, reason) {
  const url = new URL(targetPath, 'https://cynclan.com')
  url.searchParams.set('discord_auth_error', reason)
  return Response.redirect(url.toString(), 302)
}

export async function handleDiscordAuthCallback(request, env) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const rawState = searchParams.get('state') ?? '/'
  const targetPath = ALLOWED_REDIRECT_PATHS.has(rawState) ? rawState : '/'

  if (searchParams.get('error')) {
    // Most commonly access_denied - the visitor clicked "Cancel" on Discord's
    // own consent screen, not a real failure on our end.
    return errorRedirect(targetPath, 'discord_denied')
  }
  if (!code) return errorRedirect(targetPath, 'missing_code')

  let discordUser
  try {
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: env.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: DISCORD_REDIRECT_URI,
      }),
    })
    if (!tokenRes.ok) throw new Error(`Discord token exchange failed: ${tokenRes.status}`)
    const { access_token: accessToken } = await tokenRes.json()

    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!userRes.ok) throw new Error(`Discord /users/@me failed: ${userRes.status}`)
    discordUser = await userRes.json()
  } catch (err) {
    console.error('Discord OAuth exchange failed:', err)
    return errorRedirect(targetPath, 'discord_exchange_failed')
  }

  // Synthetic, never-real email - see this file's own top comment. Scoped to
  // the Discord snowflake id (immutable), not the username (which visitors
  // can change), so a username change never orphans/duplicates an account.
  const syntheticEmail = `discord-${discordUser.id}@cynclan.invalid`

  // Matches exactly what Supabase's own Discord provider used to populate,
  // so discordDisplayName()/discordUserId() (src/lib/useSession.ts) and
  // every table keyed off a Discord username elsewhere on this site keep
  // working unchanged. full_name = Discord's raw, unique "username" field
  // (not the changeable global_name display name) - see useSession.ts's own
  // comment on discordDisplayName for why that field specifically.
  const userMetadata = {
    full_name: discordUser.username,
    provider_id: discordUser.id,
    avatar_url: discordUser.avatar
      ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
      : null,
    custom_claims: { global_name: discordUser.global_name ?? null },
  }

  const supabaseAdmin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email: syntheticEmail,
    options: { data: userMetadata },
  })
  if (error || !data.properties?.hashed_token) {
    console.error('generateLink failed:', error)
    return errorRedirect(targetPath, 'session_mint_failed')
  }

  // generateLink() only sets user_metadata at first creation, not on repeat
  // calls for an already-existing user - refreshed explicitly here on every
  // sign-in so a Discord username/avatar change is picked up instead of
  // staying frozen at whatever it was the first time someone signed in.
  await supabaseAdmin.auth.admin.updateUserById(data.user.id, { user_metadata: userMetadata }).catch((err) => {
    console.error('updateUserById (metadata refresh) failed, continuing with stale metadata:', err)
  })

  // Only token_hash is needed client-side (see discordAuth.ts's
  // verifyOtp() call) - Supabase's own VerifyTokenHashParams type doesn't
  // even accept an email alongside it, confirmed live: passing one caused
  // the server to reject every verification outright with a 400 ("Only the
  // token_hash and type should be provided").
  const redirectUrl = new URL(targetPath, 'https://cynclan.com')
  redirectUrl.searchParams.set('discord_token_hash', data.properties.hashed_token)
  return Response.redirect(redirectUrl.toString(), 302)
}
