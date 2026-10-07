// KV is only ever an accelerator in front of Supabase (the source of truth), so a
// KV failure must never take an endpoint down. Workers KV's free tier caps reads
// at 100k/day and, once that is hit, get() THROWS ("KV get() limit exceeded for
// the day") - uncaught, that turned every /api/* call into a Cloudflare 1101 for
// the rest of the day. These wrappers treat any KV error as a miss/no-op so the
// callers fall back to Supabase exactly as they do on a cold cache.

export async function kvGet(kv, key) {
  try {
    return await kv.get(key)
  } catch (err) {
    console.error('KV get failed, falling back to Supabase:', err?.message ?? err)
    return null
  }
}

export async function kvPut(kv, key, value, options) {
  try {
    await kv.put(key, value, options)
  } catch (err) {
    console.error('KV put failed (cache stays cold):', err?.message ?? err)
  }
}

/**
 * Short edge cache (Cloudflare Cache API - free, no daily quota) in front of a
 * GET handler. Identical requests within `ttlSeconds` are served from the
 * data centre's cache without touching KV or Supabase at all; the client's
 * chunked game-detail / member-games requests are deterministic, so they hit
 * this almost always. Only successful (200) responses are stored.
 */
export async function edgeCached(request, ctx, ttlSeconds, handler) {
  if (request.method !== 'GET' || typeof caches === 'undefined') return handler()
  const cache = caches.default
  const key = new Request(request.url, { method: 'GET' })
  // The stored copy is cacheable for `ttlSeconds`, but what goes back to the
  // client is marked no-cache: the zone's "Browser Cache TTL" would otherwise
  // stretch a short max-age to hours in visitors' browsers (seen live: 4 h on
  // /api/roster), and the roster must stay fresh. Freshness is decided here.
  const toClient = (res) => {
    const out = new Response(res.body, res)
    out.headers.set('Cache-Control', 'no-cache')
    return out
  }
  try {
    const hit = await cache.match(key)
    if (hit) return toClient(hit)
  } catch {
    /* cache unavailable - fall through to the handler */
  }
  const response = await handler()
  // A handler may shorten the edge lifetime of one answer with X-Edge-Ttl (e.g. game details that are
  // not all cached yet).
  if (response.status === 200) {
    const ttl = Number(response.headers.get('X-Edge-Ttl')) || ttlSeconds
    const stored = new Response(response.clone().body, response)
    stored.headers.set('Cache-Control', `public, max-age=${ttl}`)
    const put = cache.put(key, stored).catch(() => {})
    if (ctx) ctx.waitUntil(put)
  }
  return response.status === 200 ? toClient(response) : response
}

/**
 * Writes only when the stored value differs. Free-tier KV allows 1000 writes a day, and the
 * scheduled refreshes run every 10 minutes: rewriting an unchanged value each tick used up the
 * whole budget. A read is far cheaper (100k a day), so compare first.
 */
export async function kvPutIfChanged(kv, key, value, options) {
  const current = await kvGet(kv, key)
  if (current === value) return false
  await kvPut(kv, key, value, options)
  return true
}
