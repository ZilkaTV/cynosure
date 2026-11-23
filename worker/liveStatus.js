// Who of the clan is live on Twitch or YouTube right now (the purple / red LIVE badges next to a name).
//
//   GET /api/live  ->  { at, twitch: { <openfront id>: { channel, title, since } }, youtube: { <openfront id>: { channel, videoId, title, since } } }
//
// Only members who put a channel in their profile (cyn_members.twitch_channel / yt_channel) are looked at. No keys are needed:
//   Twitch   decapi.me/twitch/uptime/<login> answers "2 hours, 5 minutes" while the channel is live and "<login> is offline" otherwise
//   YouTube  the channel's public /live page: it is the watch page of the running stream (canonical link + "isLiveNow") or the plain channel page
// Both are unofficial, so a failed check simply means "not live". The answer is kept for 90 seconds (in this isolate and at the edge), so the
// number of looks does not grow with the number of visitors.
const TTL_MS = 90_000
const MAX_CHANNELS = 60
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
let memo = { at: 0, data: null }

const json = (status, body, cache = 'no-store') => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': cache } })

async function getText(url, init = {}) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(6000) })
  return { status: res.status, text: await res.text() }
}

const UNIT_MS = { second: 1000, minute: 60_000, hour: 3_600_000, day: 86_400_000, week: 604_800_000, month: 2_592_000_000, year: 31_536_000_000 }
/** "1 hour, 20 minutes, 5 seconds" -> milliseconds; null when it is not such a text (offline, unknown channel, error). */
export function parseUptime(text) {
  const t = String(text ?? '').trim()
  if (!/^\d+\s+(second|minute|hour|day|week|month|year)s?\b/i.test(t)) return null
  let ms = 0
  for (const m of t.matchAll(/(\d+)\s+(second|minute|hour|day|week|month|year)s?/gi)) ms += Number(m[1]) * UNIT_MS[m[2].toLowerCase()]
  return ms
}

async function twitchLive(login) {
  try {
    const up = await getText(`https://decapi.me/twitch/uptime/${encodeURIComponent(login)}`)
    const ms = up.status === 200 ? parseUptime(up.text) : null
    if (ms == null) return null
    let title = ''
    try {
      const t = await getText(`https://decapi.me/twitch/title/${encodeURIComponent(login)}`)
      if (t.status === 200 && t.text.length < 200) title = t.text.trim()
    } catch {
      /* the title is a nice extra */
    }
    return { channel: login, title, since: new Date(Date.now() - ms).toISOString() }
  } catch {
    return null
  }
}

const decode = (s) => String(s ?? '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')

/** The result of reading a channel's /live page: the stream's video id, title and start when the channel is live, else null. */
export function parseYoutubeLive(html) {
  const canon = /<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})"/.exec(html)
  if (!canon || !/"isLiveNow":true/.test(html)) return null
  const title = /<meta name="title" content="([^"]*)"/.exec(html)?.[1]
  const start = /"startTimestamp":"([^"]+)"/.exec(html)?.[1]
  return { videoId: canon[1], title: decode(title).slice(0, 150), since: start && !Number.isNaN(Date.parse(start)) ? new Date(start).toISOString() : null }
}

async function youtubeLive(channel) {
  const path = channel.startsWith('@') ? channel : `channel/${channel}`
  try {
    const { status, text } = await getText(`https://www.youtube.com/${path}/live`, { headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', Cookie: 'SOCS=CAI; CONSENT=YES+1' } })
    if (status !== 200) return null
    const live = parseYoutubeLive(text)
    return live ? { channel, ...live } : null
  } catch {
    return null
  }
}

async function pool(items, size, fn) {
  const out = []
  let i = 0
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      for (; i < items.length; ) {
        const item = items[i++]
        out.push(await fn(item))
      }
    }),
  )
  return out
}

async function compute(env) {
  let rows = []
  try {
    const res = await env.DB.prepare("SELECT openfront_id, twitch_channel, yt_channel FROM cyn_members WHERE COALESCE(twitch_channel, '') != '' OR COALESCE(yt_channel, '') != ''").all()
    rows = res.results ?? []
  } catch {
    return { at: new Date().toISOString(), twitch: {}, youtube: {} }
  }
  const twitch = {}
  const youtube = {}
  const jobs = []
  for (const r of rows) {
    if (r.twitch_channel && /^[A-Za-z0-9_]{4,25}$/.test(r.twitch_channel)) jobs.push({ id: r.openfront_id, kind: 'twitch', channel: r.twitch_channel })
    if (r.yt_channel && (/^@[A-Za-z0-9._-]{3,30}$/.test(r.yt_channel) || /^UC[A-Za-z0-9_-]{22}$/.test(r.yt_channel))) jobs.push({ id: r.openfront_id, kind: 'youtube', channel: r.yt_channel })
  }
  await pool(jobs.slice(0, MAX_CHANNELS), 6, async (j) => {
    if (j.kind === 'twitch') {
      const live = await twitchLive(j.channel)
      if (live) twitch[j.id] = live
    } else {
      const live = await youtubeLive(j.channel)
      if (live) youtube[j.id] = live
    }
  })
  return { at: new Date().toISOString(), twitch, youtube }
}

export async function handleLive(request, env) {
  if (request.method !== 'GET') return json(405, { error: 'method_not_allowed' })
  if (!env.DB) return json(503, { error: 'not_configured' })
  if (!memo.data || Date.now() - memo.at > TTL_MS) {
    memo = { at: Date.now(), data: await compute(env) }
  }
  return json(200, memo.data, 'public, max-age=45, s-maxage=60')
}
