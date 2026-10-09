// Site session: a signed token in an HttpOnly cookie, issued after the Discord sign-in (worker/discord-auth.js).
// Identity = the member's Discord user id (stable, never the changeable username).
//
//   cyn_session = base64url(payload).base64url(HMAC-SHA256(payload, SESSION_SECRET))
//   payload     = { sub, name, global, avatar, iat, exp }

const COOKIE = 'cyn_session'
const MAX_AGE_S = 60 * 60 * 24 * 30
const enc = new TextEncoder()

const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))

async function hmacKey(env) {
  const secret = env.SESSION_SECRET
  if (!secret || secret.length < 32) throw new Error('SESSION_SECRET missing or too short')
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
}

export async function signSession(env, user) {
  const now = Math.floor(Date.now() / 1000)
  const payload = b64url(enc.encode(JSON.stringify({ sub: user.id, name: user.username, global: user.globalName ?? null, avatar: user.avatar ?? null, iat: now, exp: now + MAX_AGE_S })))
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(env), enc.encode(payload))
  return `${payload}.${b64url(sig)}`
}

export function readCookie(request, name) {
  const header = request.headers.get('Cookie') ?? ''
  for (const part of header.split(';')) {
    const i = part.indexOf('=')
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim()
  }
  return null
}

/** The signed-in visitor, or null. Never throws (a bad cookie just means "signed out"). */
export async function readSession(request, env) {
  try {
    const token = readCookie(request, COOKIE)
    if (!token) return null
    const [payload, sig] = token.split('.')
    if (!payload || !sig) return null
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(env), unb64url(sig), enc.encode(payload))
    if (!ok) return null
    const data = JSON.parse(new TextDecoder().decode(unb64url(payload)))
    if (!data.sub || typeof data.exp !== 'number' || data.exp < Date.now() / 1000) return null
    return { id: String(data.sub), username: data.name ?? 'Player', globalName: data.global ?? null, avatar: data.avatar ?? null }
  } catch {
    return null
  }
}

export const sessionCookie = (token) => `${COOKIE}=${token}; Max-Age=${MAX_AGE_S}; Path=/; HttpOnly; Secure; SameSite=Lax`
export const clearSessionCookie = () => `${COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`
