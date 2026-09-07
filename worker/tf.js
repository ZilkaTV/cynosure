// Worker route: /api/tf/<anything> → https://trackerfront.com/<anything>
// trackerfront's FFA leaderboard has no CORS headers, so browser calls must go
// through here. Same shape as worker/of.js, including the path allowlist -
// see that file's comment for why an open proxy without one is a real abuse
// risk.
const ALLOWED_PATHS = [/^api\/public\/leaderboard$/]

export async function handleTf(request) {
  const url = new URL(request.url)
  const path = url.pathname.replace(/^\/api\/tf\//, '')

  if (!ALLOWED_PATHS.some((re) => re.test(path))) {
    return new Response(JSON.stringify({ error: 'path_not_allowed' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const target = `https://trackerfront.com/${path}${url.search}`

  try {
    // Same fix as worker/of.js - a realistic User-Agent avoids the target's
    // own Cloudflare bot heuristics flagging this as automated traffic.
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
        // Same fix as worker/of.js: never cache a non-2xx upstream response
        // at the edge, or a transient hiccup gets frozen in as a "failure"
        // for everyone for up to 30 minutes (a day if served stale).
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
