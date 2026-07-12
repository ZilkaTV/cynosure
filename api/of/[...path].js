// Vercel serverless proxy: /api/of/<anything> → https://api.openfront.io/<anything>
//
// Why this exists:
//  • CORS — the OpenFront API refuses direct browser calls.
//  • Rate limits — routing every visitor through one origin lets Vercel's CDN
//    cache responses (s-maxage below), so OpenFront sees ~one request per URL
//    per cache window instead of one per visitor.

export default async function handler(req, res) {
  const segments = Array.isArray(req.query.path) ? req.query.path : [req.query.path].filter(Boolean)
  const upstreamPath = segments.map(encodeURIComponent).join('/')

  // Forward the original query string (minus the internal `path` param).
  const url = new URL(req.url, 'http://x')
  url.searchParams.delete('path')
  const qs = url.searchParams.toString()

  const target = `https://api.openfront.io/${upstreamPath}${qs ? `?${qs}` : ''}`

  try {
    const upstream = await fetch(target, { headers: { Accept: 'application/json' } })
    const body = await upstream.text()

    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Access-Control-Allow-Origin', '*')
    // Cache at the edge for 30 min, serve stale for a day while revalidating.
    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=86400')
    res.status(upstream.status).send(body)
  } catch (e) {
    res.status(502).json({ error: 'proxy_failed', message: String(e) })
  }
}
