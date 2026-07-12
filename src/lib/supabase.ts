import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * Supabase is OPTIONAL. When the env vars are absent the whole site still runs
 * (stats come from the OpenFront API directly); only the persistent, shared
 * registration/roster is disabled. `supabase` is null in that case.
 */
export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null

export const hasBackend = !!supabase
