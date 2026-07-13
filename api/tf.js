// Vercel serverless proxy: /api/tf/<anything> → https://trackerfront.com/<anything>
// trackerfront's FFA leaderboard has no CORS headers, so browser calls must go
// through here. Same shape as api/of.js. Cached at the edge.

export default async function handler(req, res) {
  const url = new URL(req.url, 'http://x')
  const path = url.searchParams.get('path') || ''
  url.searchParams.delete('path')
  const qs = url.searchParams.toString()

  const target = `https://trackerfront.com/${path}${qs ? `?${qs}` : ''}`

  try {
    const upstream = await fetch(target, { headers: { Accept: 'application/json' } })
    const body = await upstream.text()
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=86400')
    res.status(upstream.status).send(body)
  } catch (e) {
    res.status(502).json({ error: 'proxy_failed', message: String(e) })
  }
}
