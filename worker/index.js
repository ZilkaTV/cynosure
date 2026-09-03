// Single Worker entry point for the 3 API routes this site needs
// (functions/ Pages-Functions-style file routing doesn't work with
// Cloudflare's current git-connected "Workers" deployment flow - it only
// supports the classic Pages product, which is no longer offered as a
// distinct creation path in the dashboard). wrangler.jsonc's
// `assets.run_worker_first: ["/api/*"]` sends every /api/* request here;
// everything else is served directly from the static build (dist/) without
// ever invoking this Worker, including the SPA fallback for client-side
// routes (assets.not_found_handling: "single-page-application").
import { handleOf } from './of.js'
import { handleTf } from './tf.js'
import { handleHelpChat } from './help-chat.js'

const GITHUB_REPO = 'ZilkaTV/cynosure'

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url)

    if (pathname.startsWith('/api/of/')) return handleOf(request, env)
    if (pathname.startsWith('/api/tf/')) return handleTf(request, env)
    if (pathname === '/api/help-chat') return handleHelpChat(request, env)

    return new Response(JSON.stringify({ error: 'not_found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  },

  // Fired every 10 minutes by the Cron Trigger declared in wrangler.jsonc -
  // see that file's comment for why this exists (GitHub's own `schedule:`
  // trigger for refresh-details-cron.yml proved unreliable in production).
  // This ONLY pokes GitHub's repository_dispatch API - the actual scan work
  // stays on GitHub Actions, since Workers cap outbound fetch() at
  // 50/invocation on the free tier and that work needs far more than one
  // request. Dispatches two independent workflows off the same tick:
  // refresh-details (stats/roster cache) and collect-metrics (the "Metrics"
  // admin dashboard) - each fires its own repository_dispatch so one
  // workflow being slow/failing never blocks the other.
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(dispatch(env, 'refresh-details'))
    ctx.waitUntil(dispatch(env, 'collect-metrics'))
  },
}

async function dispatch(env, eventType) {
  return fetch(`https://api.github.com/repos/${GITHUB_REPO}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.GITHUB_PAT}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'cynosure-cron-trigger',
    },
    body: JSON.stringify({ event_type: eventType }),
  }).then(
    async (res) => {
      if (!res.ok) console.error(`GitHub dispatch (${eventType}) failed: ${res.status} ${await res.text()}`)
    },
    (err) => console.error(`GitHub dispatch (${eventType}) request failed:`, err),
  )
}
