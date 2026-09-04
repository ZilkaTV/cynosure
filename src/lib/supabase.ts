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
