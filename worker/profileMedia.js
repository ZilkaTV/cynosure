// The pictures of a profile page: the member's own icon (avatar) and banner, pictures or GIFs.
//
//   POST   /api/profile-media?kind=avatar|banner    body: the image file; signed-in members, their own profile only -> { url }
//   DELETE /api/profile-media?kind=avatar|banner|bio[&member=<OpenFront id>]   takes it away (own, or any by an admin)
//
// The image is stored in R2 (the same bucket and the same public route as the event screenshots: /api/screenshots/profiles/...). The file type is
// decided by the file's own first bytes, never by the name or the type the browser sent, and the address is written into the member's row by
// THIS code only: the data API refuses `avatar_url` / `banner_url` in any request (worker/dbApi.js), so nobody can point a profile at a picture
// somewhere else on the internet.
import { readSession } from './session.js'
import { sniffImage } from './screenshots.js'

const MAX_BYTES = { avatar: 2 * 1024 * 1024, banner: 5 * 1024 * 1024 }
const COLUMN = { avatar: 'avatar_url', banner: 'banner_url', bio: 'bio' }
const MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }
const OWN_URL = /^\/api\/screenshots\/(profiles\/[A-Za-z0-9_.-]{1,120})$/
const PROFILE_ID = /^[A-Za-z0-9_-]{4,40}$/
const MIN_GAP_MS = 20_000

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' } })

function originAllowed(request, env) {
  const origin = request.headers.get('Origin')
  const own = env.SITE_ENV === 'dev' && origin === new URL(request.url).origin
  return !origin || own || /^https:\/\/(www\.)?cynclan\.com$/.test(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
}

/** Deletes the stored file of an address written by this endpoint (anything else is left alone). */
async function dropFile(env, url) {
  const m = OWN_URL.exec(url ?? '')
  if (m) await env.SCREENSHOTS.delete(m[1]).catch(() => {})
}

export async function handleProfileMedia(request, env) {
  if (!env.SCREENSHOTS || !env.DB) return json(503, { error: 'storage_unavailable' })
  if (request.method !== 'POST' && request.method !== 'DELETE') return json(405, { error: 'method_not_allowed' })
  if (!originAllowed(request, env)) return json(403, { error: 'bad_origin' })
  const user = await readSession(request, env)
  if (!user) return json(401, { error: 'sign_in_required' })
  const me = await env.DB.prepare('SELECT openfront_id FROM cyn_members WHERE user_id = ? LIMIT 1').bind(user.id).first()
  if (!me) return json(403, { error: 'members_only' })

  const q = new URL(request.url).searchParams
  const kind = q.get('kind') ?? ''
  if (!COLUMN[kind]) return json(400, { error: 'bad_kind' })

  if (request.method === 'DELETE') {
    let target = me.openfront_id
    const other = q.get('member')
    if (other && other !== me.openfront_id) {
      if (!PROFILE_ID.test(other)) return json(400, { error: 'bad_member' })
      const admin = await env.DB.prepare('SELECT 1 AS x FROM cyn_event_admins WHERE user_id = ? LIMIT 1').bind(user.id).first()
      if (!admin) return json(403, { error: 'admins_only' })
      target = other
    }
    const row = await env.DB.prepare(`SELECT ${COLUMN[kind]} AS v FROM cyn_members WHERE openfront_id = ?`).bind(target).first()
    await env.DB.prepare(`UPDATE cyn_members SET ${COLUMN[kind]} = NULL WHERE openfront_id = ?`).bind(target).run()
    if (kind !== 'bio') await dropFile(env, row?.v)
    return json(200, { ok: true })
  }

  if (kind === 'bio') return json(400, { error: 'bad_kind' })
  // at most one upload every few seconds per member (each one writes to R2 and D1); a refused file does not count
  const gapKey = `pm:${me.openfront_id}`
  if (env.HOT_DB) {
    const last = await env.HOT_DB.prepare('SELECT updated_at FROM blobs WHERE key = ?').bind(gapKey).first()
    if (last && Date.now() - Date.parse(last.updated_at) < MIN_GAP_MS) return json(429, { error: 'too_fast', message: 'Wait a few seconds before the next upload.' })
  }
  const max = MAX_BYTES[kind]
  if (Number(request.headers.get('Content-Length') ?? 0) > max) return json(413, { error: 'too_large', max })
  const bytes = await request.arrayBuffer()
  if (bytes.byteLength === 0 || bytes.byteLength > max) return json(413, { error: 'too_large', max })
  const ext = sniffImage(bytes)
  if (!ext) return json(415, { error: 'not_an_image' })
  if (env.HOT_DB) await env.HOT_DB.prepare('INSERT INTO blobs (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET updated_at = excluded.updated_at').bind(gapKey, '1', new Date().toISOString()).run()

  const key = `profiles/${me.openfront_id}-${kind}-${Date.now()}.${ext}`
  const old = await env.DB.prepare(`SELECT ${COLUMN[kind]} AS v FROM cyn_members WHERE openfront_id = ?`).bind(me.openfront_id).first()
  await env.SCREENSHOTS.put(key, bytes, { httpMetadata: { contentType: MIME[ext] } })
  const url = `/api/screenshots/${key}`
  await env.DB.prepare(`UPDATE cyn_members SET ${COLUMN[kind]} = ? WHERE openfront_id = ?`).bind(url, me.openfront_id).run()
  await dropFile(env, old?.v)
  return json(200, { url })
}
