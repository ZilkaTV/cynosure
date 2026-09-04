// "Metrics" admin dashboard - visible only to holders of the Discord "inner
// circle" role (1367284321270108280). Every number here is precomputed by
// scripts/collect-metrics.mjs (see that file for how); the client only ever
// reads cheap Supabase rows, same "never compute this live in the browser"
// principle as cyn_roster_cache.
import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useProfile } from './useProfile'

export interface TodayMetrics {
  memberCount: number | null
  presenceCount: number | null
  vcActiveToday: number
  vcHoursToday: number
  publicMessages: number
  privateMessages: number
  discordJoinsToday: number
  clanRegistrationsToday: number
  siteVisitsMembers: number
  siteVisitsAnon: number
}

/** Whether the signed-in visitor currently holds the "inner circle" Discord role. */
export function useIsInnerCircle(): boolean {
  const { profile } = useProfile()
  const [isInnerCircle, setIsInnerCircle] = useState(false)

  useEffect(() => {
    if (!profile || !supabase) {
      setIsInnerCircle(false)
      return
    }
    let alive = true
    supabase
      .from('cyn_inner_circle')
      .select('openfront_id')
      .eq('openfront_id', profile.openfront_id)
      .maybeSingle()
      .then(({ data }) => {
        if (alive) setIsInnerCircle(!!data)
      })
    return () => {
      alive = false
    }
  }, [profile])

  return isInnerCircle
}

function todayUtcDateString() {
  return new Date().toISOString().slice(0, 10)
}

export async function getTodayMetrics(): Promise<TodayMetrics | null> {
  if (!supabase) return null
  const today = todayUtcDateString()
  const todayStart = `${today}T00:00:00.000Z`

  // cyn_metrics_daily/cyn_site_visits are readable only `to authenticated`
  // (see supabase/schema.sql) - a stale-but-refreshable session would
  // otherwise silently read back as the anon role, which RLS just filters
  // to zero rows (no error), showing misleadingly "empty" metrics instead
  // of a clear reason. Same proactive-refresh fix already applied to
  // claimQuest/postChatMessage for the same underlying session bug.
  await supabase.auth.getSession()

  const [{ data: daily }, membersCount, anonCount] = await Promise.all([
    supabase.from('cyn_metrics_daily').select('*').eq('day', today).maybeSingle(),
    supabase.from('cyn_site_visits').select('id', { count: 'exact', head: true }).eq('is_member', true).gte('visited_at', todayStart),
    supabase.from('cyn_site_visits').select('id', { count: 'exact', head: true }).eq('is_member', false).gte('visited_at', todayStart),
  ])

  return {
    memberCount: daily?.member_count ?? null,
    presenceCount: daily?.presence_count ?? null,
    vcActiveToday: (daily?.vc_active_member_ids ?? []).length,
    vcHoursToday: Math.round(((daily?.vc_total_minutes ?? 0) / 60) * 10) / 10,
    publicMessages: daily?.public_messages ?? 0,
    privateMessages: daily?.private_messages ?? 0,
    discordJoinsToday: daily?.discord_joins_today ?? 0,
    clanRegistrationsToday: daily?.clan_registrations_today ?? 0,
    siteVisitsMembers: membersCount.count ?? 0,
    siteVisitsAnon: anonCount.count ?? 0,
  }
}

const VISIT_LOGGED_KEY = 'cyn:visitLogged'

/** Logs one page-view for today's site-visit metric, at most once per browser tab session. */
export function logSiteVisit(isMember: boolean) {
  if (!supabase) return
  try {
    if (sessionStorage.getItem(VISIT_LOGGED_KEY)) return
    sessionStorage.setItem(VISIT_LOGGED_KEY, '1')
  } catch {
    return
  }
  supabase.from('cyn_site_visits').insert({ is_member: isMember }).then(() => {})
}
