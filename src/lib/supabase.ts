import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

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
 * Session persisted via COOKIES (createBrowserClient from @supabase/ssr),
 * not localStorage (plain createClient's default). Both the implicit
 * (`#access_token=...`) and PKCE (`?code=...` + a stored code-verifier) flows
 * were confirmed, live, to silently lose whatever they'd written to
 * localStorage by the time the app reloads after the full
 * Discord -> Supabase -> site redirect round-trip - reproduced with a forced
 * manual exchangeCodeForSession() call logging the real
 * AuthPKCECodeVerifierMissingError, and separately via the Network tab
 * showing a correct #access_token in the redirect's Location header that
 * was already gone by the time our JS read window.location.hash. Matches a
 * browser anti-tracking "bounce" mitigation that clears storage for a site
 * it thinks bounced through a third party and back - even from inside a
 * popup window, ruling out "which tab does the navigation" as the fix.
 * Directly confirmed a plain `document.cookie` write survives that exact
 * same round-trip untouched, so cookies (chunked automatically by
 * @supabase/ssr to stay under the per-cookie size limit) are the actual
 * fix, not the flow type or which window does the redirect.
 */
export const supabase: SupabaseClient | null = url && key ? createBrowserClient(url, key) : null

export const hasBackend = !!supabase
