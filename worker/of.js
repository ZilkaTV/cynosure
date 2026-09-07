// Worker route: /api/of/<anything> → https://api.openfront.io/<anything>
//
// Why this exists:
//  • CORS - the OpenFront API refuses direct browser calls.
//  • Rate limits - one shared origin lets Cloudflare's CDN cache responses
//    (s-maxage below), so OpenFront sees ~one request per URL per window.
//
// Only forwards the exact paths this site actually calls (see API_BASE usages
// in src/lib/openfront.ts and src/lib/replaySimCore.ts) - without this,
// anyone could use this Worker as a free, unauthenticated open proxy to any
// path on api.openfront.io.
const ALLOWED_PATHS = [/^leaderboard\/ranked$/, /^public\/player\/[^/]+\/games$/, /^public\/game\/[^/]+$/]

export async function handleOf(request) {
  const url = new URL(request.url)
  const path = url.pathname.replace(/^\/api\/of\//, '')

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
        // Only cache a genuinely successful response at the edge - caching
        // this unconditionally (regardless of upstream.status) meant a
        // transient OpenFront hiccup (their own Cloudflare bot challenge,
        // a 429, a 5xx) got frozen in as a cached "failure" for 30 minutes
        // (and served stale for up to a day after that), actively
        // prolonging a real-world outage that may have already cleared by
        // the very next request. Confirmed live: a single blocked request
        // to OpenFront made every visitor's "Post Game Report" for that
        // exact game keep failing long after OpenFront itself recovered.
        'Cache-Control': upstream.ok ? 's-maxage=1800, stale-while-revalidate=86400' : 'no-store',
      },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: 'proxy_failed', message: String(e) }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
