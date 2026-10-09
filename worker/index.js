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
import { handleDiscordAuthCallback, handleAuthApi } from './discord-auth.js'
import { handleDbApi } from './dbApi.js'
import { withSecurityHeaders } from './securityHeaders.js'
import { edgeCached } from './kvSafe.js'
import { handleClanMembers } from './clanMembers.js'
import { handleRoster, refreshRosterKv } from './roster.js'
import { handleClanLedger, refreshClanLedgerKv } from './clanLedger.js'
import { handleMemberGames, refreshMemberGamesKv } from './memberGames.js'
import { handleGameDetail } from './gameDetail.js'
import { handleSoloLatest, handleVerifyOwnership } from './soloLatest.js'
import { handleHotApi } from './hotApi.js'
import { handleUsersApi } from './usersApi.js'
import { refreshRankedBlob } from './ranked.js'

const GITHUB_REPO = 'ZilkaTV/cynosure'

async function supabaseRestricted(env) {
  try {
    const res = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/cyn_roster_cache?select=id&limit=1`, {
      headers: { apikey: env.VITE_SUPABASE_ANON_KEY },
      signal: AbortSignal.timeout(8000),
    })
    return res.status === 402
  } catch {
    return false
  }
}

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url)

    if (pathname.startsWith('/api/internal/users/')) return withSecurityHeaders(await handleUsersApi(request, env, pathname))
    if (pathname.startsWith('/api/internal/hot/')) return withSecurityHeaders(await handleHotApi(request, env, pathname))
    if (pathname.startsWith('/api/of/')) return withSecurityHeaders(await handleOf(request, env))
    if (pathname.startsWith('/api/tf/')) return withSecurityHeaders(await handleTf(request, env))
    // Help chat was retired (widget removed); answer 410 so nothing can reach the old AI/DB path.
    if (pathname === '/api/help-chat') {
      return withSecurityHeaders(new Response(JSON.stringify({ error: 'gone' }), { status: 410, headers: { 'Content-Type': 'application/json' } }))
    }
    if (pathname === '/api/auth/session' || pathname === '/api/auth/logout') return withSecurityHeaders(await handleAuthApi(request, env, pathname))
    if (pathname === '/api/db' || pathname === '/api/db/rpc') return withSecurityHeaders(await handleDbApi(request, env, pathname))
    if (pathname === '/api/auth/discord/callback') return withSecurityHeaders(await handleDiscordAuthCallback(request, env))
    if (pathname === '/api/roster') return withSecurityHeaders(await edgeCached(request, ctx, 60, () => handleRoster(request, env, ctx)))
    if (pathname === '/api/clan-ledger') return withSecurityHeaders(await edgeCached(request, ctx, 60, () => handleClanLedger(request, env, ctx)))
    if (pathname === '/api/member-games') return withSecurityHeaders(await edgeCached(request, ctx, 600, () => handleMemberGames(request, env)))
    if (pathname === '/api/clan-members') return withSecurityHeaders(await edgeCached(request, ctx, 3600, () => handleClanMembers(request)))
    if (pathname === '/api/verify-ownership') return withSecurityHeaders(await handleVerifyOwnership(request, env))
    if (pathname === '/api/solo-latest') return withSecurityHeaders(await edgeCached(request, ctx, 15, () => handleSoloLatest(request)))
    if (pathname === '/api/game-detail') return withSecurityHeaders(await edgeCached(request, ctx, 86400, () => handleGameDetail(request, env, ctx)))

    return withSecurityHeaders(
      new Response(JSON.stringify({ error: 'not_found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  },

  // Fired every 10 minutes by the Cron Trigger declared in wrangler.jsonc -
  // see that file's comment for why this exists (GitHub's own `schedule:`
  // trigger for refresh-details-cron.yml proved unreliable in production).
  // This ONLY pokes GitHub's repository_dispatch API - the actual scan work
  // stays on GitHub Actions, since Workers cap outbound fetch() at
  // 50/invocation on the free tier and that work needs far more than one
  // request. Dispatches four independent workflows off the same tick:
  // refresh-details (stats/roster cache), collect-metrics (the "Metrics"
  // admin dashboard), clan-score-ledger (Win Score/Loss Score/Ratio per
  // game, see src/lib/clanScore.ts), and engine-maintenance (auto-vendor +
  // Max Tiles backfill, added after the same GitHub `schedule:`-only
  // unreliability showed up there too) - each fires its own
  // repository_dispatch so one workflow being slow/failing never blocks
  // the others.
  async scheduled(event, env, ctx) {
    // Ticks every 10 minutes and every job runs on every tick. That is affordable now that the big
    // data (member game lists, game details, roster, ledger) lives in Cloudflare D1 instead of
    // Supabase, whose free egress limit is what forced the slower cadence on 2026-10-04.
    // A workflow that is still running is skipped by dispatch() (isWorkflowBusy).
    ctx.waitUntil(dispatch(env, 'refresh-details', 'refresh-details-cron.yml'))
    ctx.waitUntil(dispatch(env, 'engine-maintenance', 'engine-maintenance.yml'))
    ctx.waitUntil(dispatch(env, 'clan-score-ledger', 'clan-score-ledger.yml'))
    ctx.waitUntil(dispatch(env, 'collect-metrics', 'collect-metrics.yml'))
    // Role sync (wins tiers, speedrun title announcement): every 30 minutes.
    if (new Date(event.scheduledTime).getUTCMinutes() % 30 === 20) ctx.waitUntil(dispatch(env, 'discord-role-sync', 'discord-role-sync.yml'))
    ctx.waitUntil(refreshRankedBlob(env).catch((err) => console.error('ranked refresh failed:', err?.message ?? err)))
    // Fallback KV mirrors (only used if D1 is switched off, see worker/hotStore.js useD1).
    ctx.waitUntil(refreshRosterKv(env))
    ctx.waitUntil(refreshMemberGamesKv(env))
    ctx.waitUntil(refreshClanLedgerKv(env))
  },
}

// GitHub only keeps ONE pending (queued-but-not-started) run per
// repository_dispatch event_type's concurrency group - a newer dispatch
// SILENTLY REPLACES an already-queued one rather than erroring, even with
// `cancel-in-progress: false` in the workflow's own concurrency block
// (that setting only protects a run that has actually STARTED). Confirmed
// against real OpenFrontIO CI tooling: with every workflow here dispatched
// every 5-30 minutes while some (engine-maintenance especially) can run
// 15+ minutes, a dispatch arriving while the previous one is still queued
// - not yet started - used to vanish with no error anywhere, a plausible
// contributor to the "Max Tiles backfill silent for hours" bug chased
// earlier. Checking first and skipping the dispatch entirely when a run is
// already queued or in progress means there is never a second pending run
// to lose - the next tick ten minutes later tries again regardless.
async function isWorkflowBusy(env, workflowFile) {
  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/${workflowFile}/runs?per_page=5`, {
    headers: {
      Authorization: `Bearer ${env.GITHUB_PAT}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'cynosure-cron-trigger',
    },
  })
  if (!res.ok) {
    // A Cloudflare/GitHub hiccup on the status check itself must never
    // block the dispatch - worst case under a false "not busy" is the
    // exact pre-existing behavior (GitHub silently drops the extra
    // dispatch), never a missed run that this check could have prevented.
    console.error(`GitHub run-status check (${workflowFile}) failed: ${res.status}`)
    return false
  }
  const { workflow_runs: runs } = await res.json()
  return (runs ?? []).some((run) => run.status !== 'completed')
}

async function dispatch(env, eventType, workflowFile) {
  if (await isWorkflowBusy(env, workflowFile)) {
    console.log(`Skipping dispatch (${eventType}): ${workflowFile} already queued or running`)
    return
  }
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
