// Cloudflare Pages Function: /api/of/<anything> → https://api.openfront.io/<anything>
//
// The subpath arrives via Cloudflare's own catch-all file routing ([[path]] -
// see this file's location) as context.params.path, a string array of the
// matched segments - no query-param rewrite trick needed here, unlike the
// old Vercel version this replaces.
//
// Why this exists:
//  • CORS - the OpenFront API refuses direct browser calls.
//  • Rate limits - one shared origin lets Cloudflare's CDN cache responses
//    (s-maxage below), so OpenFront sees ~one request per URL per window.
//
// Only forwards the exact paths this site actually calls (see API_BASE usages
// in src/lib/openfront.ts and src/lib/replaySimCore.ts) - without this,
// anyone could use this function as a free, unauthenticated open proxy to
// any path on api.openfront.io.
const ALLOWED_PATHS = [/^leaderboard\/ranked$/, /^public\/player\/[^/]+\/games$/, /^public\/game\/[^/]+$/]

export async function onRequestGet(context) {
  const { request, params } = context
  const url = new URL(request.url)
  const path = (params.path || []).join('/')

  if (!ALLOWED_PATHS.some((re) => re.test(path))) {
    return new Response(JSON.stringify({ error: 'path_not_allowed' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const target = `https://api.openfront.io/${path}${url.search}`

  try {
    const upstream = await fetch(target, { headers: { Accept: 'application/json' } })
    const body = await upstream.text()
    return new Response(body, {
      status: upstream.status,
      headers: {
        'Content-Type': 'application/json',
        // Cache at the edge for 30 min, serve stale for a day while revalidating.
        'Cache-Control': 's-maxage=1800, stale-while-revalidate=86400',
      },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: 'proxy_failed', message: String(e) }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
