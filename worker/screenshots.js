// Event win-screen screenshots in Cloudflare R2 (binding SCREENSHOTS, bucket cynosure-screenshots).
//
//   POST /api/upload-screenshot?event=<id>   body: the image file, signed-in registered members only
//        -> { url: "https://cynclan.com/api/screenshots/<key>" }
//   GET  /api/screenshots/<key>              the image (public, cached)
//   PUT  /api/internal/users/screenshot?key= body: image bytes (HOT_API_SECRET) - used once by the migration script
//
// The file type is decided by the file's own first bytes, never by the name or the Content-Type the client sent.
import { readSession } from './session.js'

// Stored as a full address: the site only renders http(s) screenshot links.
const SITE = 'https://cynclan.com'
const MAX_BYTES = 8 * 1024 * 1024
const EVENT_ID = /^[a-z0-9-]{1,60}$/
const KEY = /^[A-Za-z0-9_-]{1,60}\/[A-Za-z0-9_.-]{1,120}\.(png|jpg|webp|gif)$/

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

/** 'png' | 'jpg' | 'webp' | 'gif' | null, from the magic bytes. */
export function sniffImage(bytes) {
  const b = new Uint8Array(bytes.slice(0, 12))
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png'
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg'
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'gif'
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'webp'
  return null
}
const MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }

export async function handleUpload(request, env) {
  if (!env.SCREENSHOTS) return json(503, { error: 'storage_unavailable' })
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' })
  const origin = request.headers.get('Origin')
  if (origin && !/^https:\/\/(www\.)?cynclan\.com$/.test(origin) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return json(403, { error: 'bad_origin' })
  const user = await readSession(request, env)
  if (!user) return json(401, { error: 'sign_in_required' })
  const member = await env.DB.prepare('SELECT openfront_id FROM cyn_members WHERE user_id = ? LIMIT 1').bind(user.id).first()
  if (!member) return json(403, { error: 'members_only' })
  const event = new URL(request.url).searchParams.get('event') ?? ''
  if (!EVENT_ID.test(event)) return json(400, { error: 'bad_event' })
  if (Number(request.headers.get('Content-Length') ?? 0) > MAX_BYTES) return json(413, { error: 'too_large' })
  const bytes = await request.arrayBuffer()
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) return json(413, { error: 'too_large' })
  const ext = sniffImage(bytes)
  if (!ext) return json(415, { error: 'not_an_image' })
  const key = `${event}/${member.openfront_id}-${Date.now()}.${ext}`
  await env.SCREENSHOTS.put(key, bytes, { httpMetadata: { contentType: MIME[ext] } })
  return json(200, { url: `${SITE}/api/screenshots/${key}` })
}

export async function handleScreenshotGet(request, env, pathname) {
  if (!env.SCREENSHOTS) return json(503, { error: 'storage_unavailable' })
  const key = decodeURIComponent(pathname.replace(/^\/api\/screenshots\//, ''))
  if (!KEY.test(key)) return json(404, { error: 'not_found' })
  const obj = await env.SCREENSHOTS.get(key)
  if (!obj) return json(404, { error: 'not_found' })
  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType ?? 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

/** Internal one-off import of an existing screenshot under a given key (same key checks as above). */
export async function handleScreenshotImport(request, env) {
  if (!env.SCREENSHOTS) return json(503, { error: 'storage_unavailable' })
  const key = new URL(request.url).searchParams.get('key') ?? ''
  if (!KEY.test(key)) return json(400, { error: 'bad_key' })
  const bytes = await request.arrayBuffer()
  const ext = sniffImage(bytes)
  if (!ext || bytes.byteLength > MAX_BYTES) return json(415, { error: 'not_an_image' })
  await env.SCREENSHOTS.put(key, bytes, { httpMetadata: { contentType: MIME[ext] } })
  return json(200, { url: `${SITE}/api/screenshots/${key}` })
}
