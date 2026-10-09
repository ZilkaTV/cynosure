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
//
// Each allowed path also lists the ONLY query params it forwards (see
// buildTarget). Forwarding url.search verbatim meant any visitor could append
// arbitrary ?x=<random> to an allowed path: every distinct query string is
// its own edge-cache key, so that's an unbounded supply of cache misses, each
// a real request to OpenFront - defeating the "~one upstream request per URL
// per window" protection this proxy exists for, and risking OpenFront
// rate-limiting this Worker for everyone. Path segments are restricted to
// [A-Za-z0-9_-] too (the old [^/]+ also matched encoded slashes/dots, i.e. a
// path-traversal-shaped input).
const SEG = '[A-Za-z0-9_-]+'
const ALLOWED_PATHS = [
  { re: /^leaderboard\/ranked$/, params: ['page'] },
  { re: new RegExp(`^public/player/${SEG}/games$`), params: ['filter', 'cursor'] },
  { re: new RegExp(`^public/player/${SEG}$`), params: [] },
  { re: new RegExp(`^public/game/${SEG}$`), params: ['turns'] },
  { re: /^public\/clans\/leaderboard$/, params: [] },
]

function buildTarget(path, search) {
  const rule = ALLOWED_PATHS.find((r) => r.re.test(path))
  if (!rule) return null
  const incoming = new URLSearchParams(search)
  const out = new URLSearchParams()
  for (const key of rule.params) {
    const v = incoming.get(key)
    if (v !== null && v.length <= 200) out.set(key, v)
  }
  const qs = out.toString()
  return `https://api.openfront.io/${path}${qs ? `?${qs}` : ''}`
}

export async function handleOf(request) {
  const url = new URL(request.url)
  const path = url.pathname.replace(/^\/api\/of\//, '')

  const target = buildTarget(path, url.search)
  if (!target) {
    return new Response(JSON.stringify({ error: 'path_not_allowed' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    // A missing/generic User-Agent is a common trigger for a Cloudflare-
    // fronted origin's own bot heuristics to flag server-to-server traffic
    // (like Worker-to-Worker/Cloudflare-to-Cloudflare requests) as
    // automated - confirmed live: OpenFront's own Cloudflare challenge page
    // ("Just a moment...") started coming back for every request through
    // this proxy, while the same API worked fine called directly from
    // GitHub Actions runners (scripts/refresh-details.mjs) the whole time.
    const upstream = await fetch(target, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      },
    })
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
  } catch {
    // Deliberately no error detail in the body - String(e) used to be
    // echoed back, which can leak internal fetch/runtime messages.
    return new Response(JSON.stringify({ error: 'proxy_failed' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
