// The dev copy of the site (wrangler env "dev", SITE_ENV=dev): a password in front of everything, a test sign-in that
// needs no Discord, and no way to start the real workflows. Nothing here runs on the real site (SITE_ENV is not set there).
import { signSession, sessionCookie } from './session.js'

export const isDev = (env) => env?.SITE_ENV === 'dev'

const enc = new TextEncoder()
async function same(a, b) {
  const [x, y] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))])
  const ax = new Uint8Array(x)
  const ay = new Uint8Array(y)
  let diff = 0
  for (let i = 0; i < ax.length; i++) diff |= ax[i] ^ ay[i]
  return diff === 0
}

/**
 * The password gate (HTTP basic auth, any user name). Returns a Response when the request must stop here, null when it may go on.
 * Without the DEV_PASSWORD secret everything stays locked, so a forgotten secret never opens the dev site. The scripts' internal
 * endpoints have their own secret and pass.
 */
export async function devGate(request, env) {
  const { pathname } = new URL(request.url)
  // DEV_OPEN=1 (a plain variable in wrangler.jsonc) takes the password away: the dev site is then open to everybody with the link.
  if (env.DEV_OPEN === '1') return null
  if (pathname.startsWith('/api/internal/')) return null
  if (!env.DEV_PASSWORD) return new Response('Dev site locked: set the DEV_PASSWORD secret (wrangler secret put DEV_PASSWORD --env dev).', { status: 503, headers: { 'X-Robots-Tag': 'noindex' } })
  const header = request.headers.get('Authorization') ?? ''
  if (header.startsWith('Basic ')) {
    try {
      const given = atob(header.slice(6)).split(':').slice(1).join(':')
      if (await same(given, env.DEV_PASSWORD)) return null
    } catch {
      /* fall through */
    }
  }
  return new Response('Password needed', { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="cynosure dev"', 'X-Robots-Tag': 'noindex' } })
}

/**
 * GET /api/auth/dev-login?member=<OpenFront id>&to=<path>  (dev only): signs in as that member without Discord, so every member-only
 * page can be tried. Also sets a readable cookie with the member's id: the page restores the member's profile from it (the gate of the
 * stats pages) - on the dev site nobody has to sign in with Discord.
 */
export async function handleDevLogin(request, env) {
  const url = new URL(request.url)
  const openfrontId = url.searchParams.get('member') ?? ''
  if (!/^[A-Za-z0-9_-]{4,16}$/.test(openfrontId)) return new Response('Use /api/auth/dev-login?member=<OpenFront id>', { status: 400 })
  const member = await env.DB.prepare('SELECT openfront_id, in_game_name, user_id, discord_username, timezone, nationality FROM cyn_members WHERE openfront_id = ?').bind(openfrontId).first()
  if (!member) return new Response('No member with this OpenFront id in the dev database.', { status: 404 })
  const accountId = member.user_id || `dev-${member.openfront_id}`
  // Giving the member a stand-in account id is a convenience for member-only writes; reading the site works without it, so a
  // database that cannot write right now (daily limit) does not stop the sign-in.
  if (!member.user_id) await env.DB.prepare('UPDATE cyn_members SET user_id = ? WHERE openfront_id = ?').bind(accountId, member.openfront_id).run().catch(() => {})
  const name = member.discord_username || member.in_game_name
  const token = await signSession(env, { id: accountId, username: name, globalName: name, avatar: null })
  const to = url.searchParams.get('to') ?? '/'
  const target = to === '/' || /^\/[^/\\]/.test(to) ? to : '/'
  const headers = new Headers({ Location: target, 'Cache-Control': 'no-store' })
  headers.append('Set-Cookie', sessionCookie(token))
  headers.append('Set-Cookie', `cyn_dev_member=${member.openfront_id}; Max-Age=2592000; Path=/; Secure; SameSite=Lax`)
  // The member's profile itself, so the page opens the member-only pages at once without asking the database first.
  const profile = { openfront_id: member.openfront_id, in_game_name: member.in_game_name, timezone: member.timezone || 'UTC', discord_username: member.discord_username || undefined, nationality: member.nationality || undefined }
  headers.append('Set-Cookie', `cyn_dev_profile=${encodeURIComponent(JSON.stringify(profile))}; Max-Age=2592000; Path=/; Secure; SameSite=Lax`)
  return new Response(null, { status: 302, headers })
}

/** A page request of a browser that is not signed in yet is sent through the dev sign-in once, as the default member. */
export function devAutoLogin(request, env) {
  if (request.method !== 'GET' || !(request.headers.get('Accept') ?? '').includes('text/html')) return null
  const cookies = request.headers.get('Cookie') ?? ''
  if (cookies.includes('cyn_dev_profile=')) return null
  const url = new URL(request.url)
  if (url.searchParams.has('_dl')) return null // came back from the sign-in without a cookie: do not loop
  const back = new URL(url.pathname + url.search, url.origin)
  back.searchParams.set('_dl', '1')
  const member = env.DEV_DEFAULT_MEMBER || 'qNZMiEyR'
  return Response.redirect(`${url.origin}/api/auth/dev-login?member=${encodeURIComponent(member)}&to=${encodeURIComponent(back.pathname + back.search)}`, 302)
}
