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
 * GET /api/auth/dev-login?member=<OpenFront id>  (dev only): signs in as that member without Discord, so every member-only page
 * can be tried. The member row of the dev database gets a stand-in account id when it has none.
 */
export async function handleDevLogin(request, env) {
  const url = new URL(request.url)
  const openfrontId = url.searchParams.get('member') ?? ''
  if (!/^[A-Za-z0-9_-]{4,16}$/.test(openfrontId)) return new Response('Use /api/auth/dev-login?member=<OpenFront id>', { status: 400 })
  const member = await env.DB.prepare('SELECT openfront_id, in_game_name, user_id FROM cyn_members WHERE openfront_id = ?').bind(openfrontId).first()
  if (!member) return new Response('No member with this OpenFront id in the dev database.', { status: 404 })
  const accountId = member.user_id || `dev-${member.openfront_id}`
  if (!member.user_id) await env.DB.prepare('UPDATE cyn_members SET user_id = ? WHERE openfront_id = ?').bind(accountId, member.openfront_id).run()
  const token = await signSession(env, { id: accountId, username: member.in_game_name, globalName: member.in_game_name, avatar: null })
  return new Response(null, { status: 302, headers: { Location: url.searchParams.get('to') === 'register' ? '/register' : '/', 'Set-Cookie': sessionCookie(token), 'Cache-Control': 'no-store' } })
}
