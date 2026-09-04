import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

// Duplicates openfront.ts's CACHE_NS ('of:v4') rather than importing it -
// openfront.ts itself imports `supabase` from this module, so importing the
// other way here would be circular.
const OPENFRONT_CACHE_NS = 'of:v4'

/**
 * Proactively guards against `QuotaExceededError` BEFORE Supabase's own
 * client is even constructed below, so its session write always has
 * headroom. Confirmed live: this site's own OpenFront API cache in
 * localStorage (src/lib/openfront.ts's `:lastgood:`/`:detail:` entries,
 * which grow forever by design) had filled a member's entire per-origin
 * storage quota - first surfaced as our own tiny `cyn:profile` write
 * failing (fixed reactively in profiles.ts), then AGAIN as Supabase's own
 * session persistence silently failing/getting lost mid-use, since it
 * writes to the exact same quota-limited pool and has no fallback of its
 * own. Pruning here, before anything else touches storage, means neither
 * failure mode can happen in the first place.
 */
function ensureStorageHeadroom() {
  try {
    const probeKey = '__quota_probe__'
    localStorage.setItem(probeKey, '1')
    localStorage.removeItem(probeKey)
  } catch (err) {
    if (err instanceof DOMException && err.name === 'QuotaExceededError') {
      try {
        Object.keys(localStorage)
          .filter((k) => k.startsWith(OPENFRONT_CACHE_NS))
          .forEach((k) => localStorage.removeItem(k))
      } catch {
        /* nothing more we can do */
      }
    }
  }
}
ensureStorageHeadroom()

/**
 * Supabase is OPTIONAL. When the env vars are absent the whole site still runs
 * (stats come from the OpenFront API directly); only the persistent, shared
 * registration/roster is disabled. `supabase` is null in that case.
 *
 * Back on the default "implicit" flow (a `#access_token=...` hash instead of
 * PKCE's `?code=...` query param) - PKCE was tried first for a real "stuck on
 * Members Only after signing in" report, but confirmed directly (via a forced
 * manual exchangeCodeForSession() call and its logged error) that PKCE's own
 * code-verifier goes missing from localStorage by the time the app reloads
 * after the full Discord -> Supabase -> site redirect round-trip, even though
 * plain localStorage reads/writes work fine outside that round-trip - this
 * matches Chromium's "bounce tracking mitigation" privacy feature, which
 * clears storage for a site it thinks is being used to "bounce" through
 * third parties, a false positive for exactly this kind of OAuth flow.
 */
export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null

export const hasBackend = !!supabase
