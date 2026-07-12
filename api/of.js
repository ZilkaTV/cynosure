// Vercel serverless proxy: /api/of/<anything> → https://api.openfront.io/<anything>
//
// The subpath arrives as ?path=<a/b/c> via the rewrite in vercel.json (Vercel's
// native functions don't reliably match multi-segment [...catch-all] filenames,
// so we route through a single function instead).
//
// Why this exists:
//  • CORS — the OpenFront API refuses direct browser calls.
//  • Rate limits — one shared origin lets Vercel's CDN cache responses
//    (s-maxage below), so OpenFront sees ~one request per URL per window.

export default async function handler(req, res) {
  const url = new URL(req.url, 'http://x')
  const path = url.searchParams.get('path') || ''
  url.searchParams.delete('path')
  const qs = url.searchParams.toString()

  const target = `https://api.openfront.io/${path}${qs ? `?${qs}` : ''}`

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
