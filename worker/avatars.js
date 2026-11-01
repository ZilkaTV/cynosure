// GET /api/avatars/<openfront id>: the Discord icon of a member, the default profile picture when the member uploaded none (used for the
// player cards too). The Discord user id stays in the database: the Worker looks it up and fetches the picture from Discord's CDN itself, so
// the browser only ever sees our own address (no new image source for the page, and canvas drawing works without CORS).
const ID = /^[A-Za-z0-9_-]{4,40}$/

export async function handleAvatar(request, env, ctx) {
  const id = new URL(request.url).pathname.split('/').pop()?.replace(/\.(png|webp|jpg)$/, '') ?? ''
  if (!ID.test(id) || !env.DB) return new Response('not found', { status: 404 })
  const row = await env.DB.prepare('SELECT discord_user_id, discord_avatar FROM cyn_members WHERE openfront_id = ?').bind(id).first().catch(() => null)
  if (!row?.discord_user_id || !row?.discord_avatar || !/^[a-z0-9_]{6,64}$/.test(row.discord_avatar) || !/^\d{5,25}$/.test(row.discord_user_id)) {
    return new Response('not found', { status: 404, headers: { 'Cache-Control': 'public, max-age=300' } })
  }
  const url = `https://cdn.discordapp.com/avatars/${row.discord_user_id}/${row.discord_avatar}.png?size=256`
  const res = await fetch(url, { cf: { cacheTtl: 86400, cacheEverything: true } })
  if (!res.ok) return new Response('not found', { status: 404, headers: { 'Cache-Control': 'public, max-age=300' } })
  // the hash changes with the picture, so the address "?v=<hash>" the page asks for may be cached for a long time
  return new Response(res.body, { headers: { 'Content-Type': res.headers.get('Content-Type') ?? 'image/png', 'Cache-Control': 'public, max-age=86400' } })
}
