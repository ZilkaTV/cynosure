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
}
