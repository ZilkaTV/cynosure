import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

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
