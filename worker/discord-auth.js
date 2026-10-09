// Discord sign-in. The browser is sent to Discord's consent screen asking ONLY for `identify` (no email,
// see src/lib/discordAuth.ts), Discord redirects back here with a code, and this handler exchanges it itself and
// issues the site's own session cookie (worker/session.js). Nothing else is stored: the identity is the Discord
// user id, and everything the site needs about the person (username, avatar) rides inside the signed cookie.

import { signSession, sessionCookie, clearSessionCookie, readSession, readCookie } from './session.js'

// Public by design (a Discord OAuth Client ID is embedded in the authorize URL the browser is sent to).
// DISCORD_CLIENT_SECRET is the real secret and only ever lives in this Worker's env.
const DISCORD_CLIENT_ID = '1525830274741571664'
const DISCORD_REDIRECT_URI = 'https://cynclan.com/api/auth/discord/callback'

// Only ever redirect back to a known page of this site - `state` is visitor-controlled.
const ALLOWED_REDIRECT_PATHS = new Set(['/register', '/survey'])

const NONCE_COOKIE = 'cyn_oauth_nonce'

function redirect(targetPath, params, extraHeaders = []) {
  const url = new URL(targetPath, 'https://cynclan.com')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const headers = new Headers({ Location: url.toString() })
  for (const [k, v] of extraHeaders) headers.append(k, v)
  return new Response(null, { status: 302, headers })
}

const clearNonce = ['Set-Cookie', `${NONCE_COOKIE}=; Max-Age=0; Path=/api/auth; Secure; SameSite=Lax`]

export async function handleDiscordAuthCallback(request, env) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  // `state` is `<path>|<nonce>`. The same nonce was also stored in a short-lived cookie by the browser before it
  // left for Discord: an attacker who sends a victim a callback link built from the attacker's own code can't also
  // plant that cookie, so a mismatch means this callback was not started by this browser (login CSRF).
  const [rawPath, nonce] = (searchParams.get('state') ?? '').split('|')
  const targetPath = ALLOWED_REDIRECT_PATHS.has(rawPath) ? rawPath : '/'

  if (searchParams.get('error')) return redirect(targetPath, { discord_auth_error: 'discord_denied' }, [clearNonce])
  if (!code) return redirect(targetPath, { discord_auth_error: 'missing_code' }, [clearNonce])

  const cookieNonce = readCookie(request, NONCE_COOKIE)
  if (!nonce || !cookieNonce || nonce !== cookieNonce) {
    return redirect(targetPath, { discord_auth_error: 'state_mismatch' }, [clearNonce])
  }

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
    const userRes = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!userRes.ok) throw new Error(`Discord /users/@me failed: ${userRes.status}`)
    discordUser = await userRes.json()
  } catch (err) {
    console.error('Discord OAuth exchange failed:', err)
    return redirect(targetPath, { discord_auth_error: 'discord_exchange_failed' }, [clearNonce])
  }

  let token
  try {
    token = await signSession(env, {
      id: discordUser.id,
      // The raw, unique username (e.g. "zjlka"), not the changeable display name - admin and moderator lists are keyed on it.
      username: discordUser.username,
      globalName: discordUser.global_name ?? null,
      avatar: discordUser.avatar ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png` : null,
    })
  } catch (err) {
    console.error('signSession failed:', err)
    return redirect(targetPath, { discord_auth_error: 'session_mint_failed' }, [clearNonce])
  }
  // An admin/moderator who was added by name before ever signing in gets linked to this Discord id now.
  if (env.DB) {
    try {
      await env.DB.batch([
        env.DB.prepare('UPDATE cyn_event_admins SET user_id = ? WHERE discord_username = ? AND user_id IS NULL').bind(discordUser.id, discordUser.username),
        env.DB.prepare('UPDATE cyn_chat_moderators SET user_id = ? WHERE discord_username = ? AND user_id IS NULL').bind(discordUser.id, discordUser.username),
      ])
    } catch (err) {
      console.error('linking admin/moderator rows failed:', err)
    }
  }
  return redirect(targetPath, { discord_signed_in: '1' }, [['Set-Cookie', sessionCookie(token)], clearNonce])
}

const jsonNoStore = (body, extra = {}) =>
  new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra } })

/** GET /api/auth/session -> { user } ; POST /api/auth/logout -> clears the cookie. */
export async function handleAuthApi(request, env, pathname) {
  if (pathname === '/api/auth/session' && request.method === 'GET') {
    return jsonNoStore({ user: await readSession(request, env) })
  }
  if (pathname === '/api/auth/logout' && request.method === 'POST') {
    return jsonNoStore({ ok: true }, { 'Set-Cookie': clearSessionCookie() })
  }
  return new Response('Not found', { status: 404 })
}
