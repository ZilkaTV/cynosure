import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * Supabase is OPTIONAL. When the env vars are absent the whole site still runs
 * (stats come from the OpenFront API directly); only the persistent, shared
 * registration/roster is disabled. `supabase` is null in that case.
 *
 * `flowType: 'pkce'` (instead of supabase-js's older default "implicit" flow):
 * the implicit flow hands the session back as a URL HASH fragment
 * (`#access_token=...`) after the Discord OAuth redirect - confirmed directly
 * to be the actual cause of a real, reproducible "stuck on Members Only right
 * after signing in" report: Opera GX's built-in tracker/ad blocking (and
 * privacy-focused extensions generally) treats a `#...` fragment as a
 * trackable parameter and strips it from the URL before the app's own JS gets
 * a chance to read it, discarding a perfectly valid login. PKCE instead
 * delivers a `?code=...` QUERY parameter, which nothing strips (too much of
 * the web depends on query strings for real functionality) - confirmed the
 * bug reproduces in a normal Opera GX window but not in an extension-free
 * Incognito one, isolating it to exactly this URL-fragment stripping.
 */
export const supabase: SupabaseClient | null = url && key ? createClient(url, key, { auth: { flowType: 'pkce' } }) : null

export const hasBackend = !!supabase

// Temporary - tracking down a report where supabase-js's own automatic PKCE
// callback detection (_initialize() -> _isPKCECallback()) never seems to
// fire at all, despite a real ?code=... from Discord/Supabase's own
// redirect being present in the URL and a matching code-verifier
// confirmed present in localStorage. This manually forces the exchange and
// logs whatever error actually comes back, since the automatic path fails
// completely silently (getSession() just reports hasSession: false with no
// error at all). Safe to remove once the real cause is found.
if (supabase && typeof window !== 'undefined' && window.location.search.includes('code=')) {
  const href = window.location.href
  supabase.auth
    .exchangeCodeForSession(href)
    .then((result) => {
      console.info('[auth] manual exchangeCodeForSession', { href, result })
    })
    .catch((err) => {
      console.info('[auth] manual exchangeCodeForSession threw', { href, err })
    })
}
