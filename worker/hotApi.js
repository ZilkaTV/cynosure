// Internal write/read API for the D1 hot store, used by the GitHub Actions scripts
// (scripts/lib/hotstore.mjs) so they need no Cloudflare API token - only a shared secret
// (HOT_API_SECRET, set on both sides). Values are passed through as TEXT, never parsed: the
// Worker's free CPU budget is far too small for JSON.parse on megabytes.
//
//   GET  /api/internal/hot/digests                     [{openfront_id, game_count, updated_at, digest}]
//   GET  /api/internal/hot/games?ids=a,b               {"a":[...games...],"b":[...]}  (<= 20 ids)
//   GET  /api/internal/hot/newest                      {"newest": iso|null}
//   PUT  /api/internal/hot/games?id=X&count=N          body: <digest json>\n<games json>
//   GET  /api/internal/hot/detail-ids                  ["gameId", ...]
//   GET  /api/internal/hot/details?ids=a,b             {"a":{...},"b":{...}}  (<= 50 ids)
//   PUT  /api/internal/hot/detail?id=X                 body: <detail json>
//   GET  /api/internal/hot/old-shape?limit=N           ["gameId", ...]
import { d1MemberGames, d1GameDetails, joinJsonObject } from './hotStore.js'

const ID = /^[A-Za-z0-9_-]{1,64}$/
const json = (status, body) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

function authorized(request, env) {
  const secret = env.HOT_API_SECRET
  if (!secret || secret.length < 24) return false
  const given = (request.headers.get('Authorization') ?? '').replace(/^Bearer /, '')
  if (given.length !== secret.length) return false
  let diff = 0
  for (let i = 0; i < secret.length; i++) diff |= given.charCodeAt(i) ^ secret.charCodeAt(i)
  return diff === 0
}

const idList = (param, max) => {
  const ids = [...new Set((param ?? '').split(',').filter(Boolean))]
  return ids.length <= max && ids.every((i) => ID.test(i)) ? ids : null
}

export async function handleHotApi(request, env, pathname) {
  if (!env.HOT_DB) return json(503, { error: 'no_db' })
  if (!authorized(request, env)) return json(401, { error: 'unauthorized' })
  const url = new URL(request.url)
  const op = pathname.replace(/^\/api\/internal\/hot\//, '')
  const db = env.HOT_DB

  try {
    if (request.method === 'GET') {
      if (op === 'digests') {
        const { results } = await db.prepare('SELECT openfront_id, game_count, updated_at, digest FROM member_games').all()
        const parts = (results ?? []).map(
          (r) => `{"openfront_id":${JSON.stringify(r.openfront_id)},"game_count":${Number(r.game_count) || 0},"updated_at":${JSON.stringify(r.updated_at)},"digest":${r.digest ?? 'null'}}`,
        )
        return json(200, `[${parts.join(',')}]`)
      }
      if (op === 'games') {
        const ids = idList(url.searchParams.get('ids'), 20)
        if (!ids) return json(400, { error: 'bad_ids' })
        return json(200, joinJsonObject(await d1MemberGames(env, ids)))
      }
      if (op === 'newest') {
        const row = await db.prepare('SELECT MAX(updated_at) AS newest FROM member_games').first()
        return json(200, { newest: row?.newest ?? null })
      }
      if (op === 'detail-ids') {
        const { results } = await db.prepare('SELECT game_id FROM game_detail').all()
        return json(200, (results ?? []).map((r) => r.game_id))
      }
      if (op === 'details') {
        const ids = idList(url.searchParams.get('ids'), 50)
        if (!ids) return json(400, { error: 'bad_ids' })
        return json(200, joinJsonObject(await d1GameDetails(env, ids)))
      }
      if (op === 'old-shape') {
        const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 100, 1), 500)
        const { results } = await db.prepare("SELECT game_id FROM game_detail WHERE json_extract(detail, '$.winnerClientIds') IS NULL LIMIT ?").bind(limit).all()
        return json(200, (results ?? []).map((r) => r.game_id))
      }
    }

    if (request.method === 'PUT') {
      if (op === 'games') {
        const id = url.searchParams.get('id') ?? ''
        const count = Number(url.searchParams.get('count'))
        if (!ID.test(id)) return json(400, { error: 'bad_id' })
        if (!Number.isInteger(count) || count < 0) return json(400, { error: 'bad_count' })
        const body = await request.text()
        const cut = body.indexOf('\n')
        if (cut < 0) return json(400, { error: 'bad_body' })
        const digest = body.slice(0, cut)
        const games = body.slice(cut + 1)
        await db
          .prepare(
            'INSERT INTO member_games (openfront_id, games, game_count, updated_at, digest) VALUES (?, ?, ?, ?, ?) ' +
              'ON CONFLICT(openfront_id) DO UPDATE SET games = excluded.games, game_count = excluded.game_count, updated_at = excluded.updated_at, digest = excluded.digest',
          )
          .bind(id, games, count, new Date().toISOString(), digest)
          .run()
        return json(200, { ok: true })
      }
      if (op === 'detail') {
        const id = url.searchParams.get('id') ?? ''
        if (!ID.test(id)) return json(400, { error: 'bad_id' })
        const body = await request.text()
        await db
          .prepare('INSERT INTO game_detail (game_id, detail) VALUES (?, ?) ON CONFLICT(game_id) DO UPDATE SET detail = excluded.detail')
          .bind(id, body)
          .run()
        return json(200, { ok: true })
      }
    }
    return json(404, { error: 'not_found' })
  } catch (err) {
    console.error('hot api failed:', op, err?.message ?? err)
    return json(500, { error: 'failed' })
  }
}
