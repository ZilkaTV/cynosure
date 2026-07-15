// ── Event submissions ────────────────────────────────────────────────────────
// Members submit a game link + win-screen screenshot through the site instead
// of posting in Discord. A whitelisted admin reviews it and accepts or denies;
// accepted submissions add to their team's point total.

import { supabase } from './supabase'

export type SubmissionCategory = 'public' | 'scrim_3v3' | 'scrim_4plus' | 'tournament'

export const CATEGORY_POINTS: Record<SubmissionCategory, number> = {
  public: 1,
  scrim_3v3: 2,
  scrim_4plus: 5,
  tournament: 10,
}

export const CATEGORY_LABELS: Record<SubmissionCategory, string> = {
  public: 'Public Trio game win (1 pt)',
  scrim_3v3: '3v3 scrim win (2 pts)',
  scrim_4plus: 'Scrim win, 4+ teams (5 pts)',
  tournament: 'Tournament win (10 pts)',
}

export interface EventTeam {
  id: string
  event_id: string
  name: string
  starting_points: number
  captain: string | null
  players: string[]
}

export interface EventSubmission {
  id: string
  event_id: string
  team_id: string
  submitted_by: string
  game_link: string
  screenshot_url: string
  category: SubmissionCategory
  points: number
  status: 'pending' | 'accepted' | 'denied'
  reviewed_by: string | null
  created_at: string
}

export async function fetchEventTeams(eventId: string): Promise<EventTeam[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from('cyn_event_teams').select('*').eq('event_id', eventId)
  if (error) throw error
  return (data as EventTeam[]) ?? []
}

export async function fetchEventSubmissions(eventId: string): Promise<EventSubmission[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('cyn_event_submissions')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data as EventSubmission[]) ?? []
}

/** Team standings: starting points + accepted submissions, sorted highest first. */
export function computeStandings(teams: EventTeam[], submissions: EventSubmission[]) {
  return teams
    .map((t) => {
      const earned = submissions.filter((s) => s.team_id === t.id && s.status === 'accepted').reduce((s, x) => s + x.points, 0)
      return { team: t, points: t.starting_points + earned }
    })
    .sort((a, b) => b.points - a.points)
}

export async function isEventAdmin(discordUsername: string | undefined): Promise<boolean> {
  if (!supabase || !discordUsername) return false
  const { data, error } = await supabase
    .from('cyn_event_admins')
    .select('discord_username')
    .eq('discord_username', discordUsername)
    .maybeSingle()
  if (error) return false
  return !!data
}

export async function fetchEventAdmins(): Promise<string[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from('cyn_event_admins').select('discord_username').order('discord_username')
  if (error) return []
  return (data as { discord_username: string }[]).map((r) => r.discord_username)
}

export interface AdminActionResult {
  ok: boolean
  message: string
}

/** Only succeeds if the caller is already an admin themselves - enforced by the table's own RLS policy, not just this check. */
export async function addEventAdmin(discordUsername: string): Promise<AdminActionResult> {
  if (!supabase) return { ok: false, message: 'Backend not connected.' }
  const trimmed = discordUsername.trim()
  if (!trimmed) return { ok: false, message: 'Enter a Discord username first.' }
  const { error } = await supabase.from('cyn_event_admins').insert({ discord_username: trimmed })
  if (error) return { ok: false, message: error.code === '23505' ? 'Already an admin.' : `Couldn't add: ${error.message}` }
  return { ok: true, message: `${trimmed} is now an admin.` }
}

export async function removeEventAdmin(discordUsername: string): Promise<AdminActionResult> {
  if (!supabase) return { ok: false, message: 'Backend not connected.' }
  const { error } = await supabase.from('cyn_event_admins').delete().eq('discord_username', discordUsername)
  if (error) return { ok: false, message: `Couldn't remove: ${error.message}` }
  return { ok: true, message: `${discordUsername} removed.` }
}

export interface SubmitEntryResult {
  ok: boolean
  message: string
}

export async function submitEventEntry(params: {
  eventId: string
  teamId: string
  openfrontId: string
  gameLink: string
  category: SubmissionCategory
  screenshotFile: File
}): Promise<SubmitEntryResult> {
  if (!supabase) return { ok: false, message: 'Backend not connected.' }
  if (!params.gameLink.trim()) return { ok: false, message: 'Please paste the game link.' }
  if (!params.screenshotFile) return { ok: false, message: 'Please attach a screenshot of the win screen.' }

  const ext = params.screenshotFile.name.split('.').pop() || 'png'
  const path = `${params.eventId}/${params.openfrontId}-${Date.now()}.${ext}`

  const { error: uploadError } = await supabase.storage.from('event-screenshots').upload(path, params.screenshotFile)
  if (uploadError) return { ok: false, message: `Screenshot upload failed: ${uploadError.message}` }

  const { data: pub } = supabase.storage.from('event-screenshots').getPublicUrl(path)

  const { error } = await supabase.from('cyn_event_submissions').insert({
    event_id: params.eventId,
    team_id: params.teamId,
    submitted_by: params.openfrontId,
    game_link: params.gameLink.trim(),
    screenshot_url: pub.publicUrl,
    category: params.category,
    points: CATEGORY_POINTS[params.category],
  })
  if (error) return { ok: false, message: `Couldn't submit: ${error.message}` }

  return { ok: true, message: 'Submitted! An admin will review it soon.' }
}

export async function reviewSubmission(id: string, decision: 'accepted' | 'denied', reviewerDiscord: string): Promise<void> {
  if (!supabase) return
  const { error } = await supabase
    .from('cyn_event_submissions')
    .update({ status: decision, reviewed_by: reviewerDiscord, reviewed_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}
