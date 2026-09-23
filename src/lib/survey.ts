// ── Community awards survey ("Umfrage", September 2026 edition) ────────────
// Open to EVERYONE, not just registered [CYN] members - see Survey.tsx.
// Content is fixed English regardless of the site's own language switcher
// (this is a one-off community poll, not part of the translated UI chrome).

import { supabase } from './supabase'

export interface SurveyQuestion {
  id: string
  text: string
}

export interface SurveyCategory {
  id: 'special' | 'clans' | 'players'
  title: string
  questions: SurveyQuestion[]
}

export const SURVEY_CATEGORIES: SurveyCategory[] = [
  {
    id: 'special',
    title: 'Special',
    questions: [
      { id: 'special_moderator', text: 'Which OpenFront moderator is the best?' },
      { id: 'special_staff', text: 'Which OpenFront staff/manager is the best?' },
      { id: 'special_livestreamer', text: 'Which OpenFront livestreamer is the best?' },
      { id: 'special_videocreator', text: 'Which OpenFront video creator is the best?' },
      { id: 'special_designer', text: 'Which OpenFront graphic designer is the best?' },
    ],
  },
  {
    id: 'clans',
    title: 'Clans',
    questions: [
      { id: 'clans_ffa', text: 'Which OpenFront clan is the best in the FFA category? (Use [TAG])' },
      { id: 'clans_1v1', text: 'Which OpenFront clan is the best in the 1v1 category? (Use [TAG])' },
      { id: 'clans_2v2', text: 'Which OpenFront clan is the best in the 2v2 category? (Use [TAG])' },
      { id: 'clans_team', text: 'Which OpenFront clan is the best in the Team Games category? (Use [TAG])' },
      { id: 'clans_overall', text: 'Which OpenFront clan is the best overall? (Use [TAG])' },
    ],
  },
  {
    id: 'players',
    title: 'Players',
    questions: [
      { id: 'players_ffa', text: 'Which OpenFront player is the best in the FFA category?' },
      { id: 'players_1v1', text: 'Which OpenFront player is the best in the 1v1 category?' },
      { id: 'players_2v2', text: 'Which OpenFront player is the best in the 2v2 category?' },
      { id: 'players_team', text: 'Which OpenFront player is the best in the Team Games category?' },
      { id: 'players_overall', text: 'Which OpenFront player is the best overall?' },
    ],
  },
]

export const ALL_SURVEY_QUESTIONS: SurveyQuestion[] = SURVEY_CATEGORIES.flatMap((c) => c.questions)

/** How many nominee slots each question has. */
export const ANSWERS_PER_QUESTION = 5

/**
 * OpenFront in-game names / clan tags don't contain spaces or punctuation in
 * practice, and the request was explicit: no special characters, no spaces.
 * Letters, digits, underscore and hyphen cover every real name/tag seen on
 * the roster elsewhere on this site (see CLAN_TAG usage) without being so
 * strict a legitimate one gets rejected.
 */
export const NAME_PATTERN = /^[A-Za-z0-9_-]+$/
export const MAX_NAME_LENGTH = 32

export type SurveyAnswers = Record<string, string[]>

/** Every non-empty slot must be unique within its own question (case-insensitive) and match NAME_PATTERN. */
export function validateAnswers(answers: SurveyAnswers): string | null {
  for (const q of ALL_SURVEY_QUESTIONS) {
    const slots = (answers[q.id] ?? []).map((s) => s.trim()).filter(Boolean)
    for (const name of slots) {
      if (name.length > MAX_NAME_LENGTH) return `"${name}" is too long (max ${MAX_NAME_LENGTH} characters).`
      if (!NAME_PATTERN.test(name)) return `"${name}" contains a character that isn't allowed (letters, numbers, "_" and "-" only, no spaces).`
    }
    const lower = slots.map((s) => s.toLowerCase())
    if (new Set(lower).size !== lower.length) return `You entered the same name twice for "${q.text}".`
  }
  return null
}

/** Strips empty slots before saving - an all-blank question is just "no opinion", not five empty strings. */
function cleanAnswers(answers: SurveyAnswers): SurveyAnswers {
  const cleaned: SurveyAnswers = {}
  for (const q of ALL_SURVEY_QUESTIONS) {
    const slots = (answers[q.id] ?? []).map((s) => s.trim()).filter(Boolean)
    if (slots.length) cleaned[q.id] = slots
  }
  return cleaned
}

const DRAFT_KEY = 'cyn:surveyDraft'

export interface SurveyDraft {
  inGameName: string
  answers: SurveyAnswers
  comment: string
}

/** Saved BEFORE sending someone off to Discord sign-in, so the redirect round-trip doesn't lose what they already typed. */
export function saveSurveyDraft(draft: SurveyDraft) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
  } catch {
    /* best-effort - worst case they retype their answers */
  }
}

export function loadSurveyDraft(): SurveyDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    return raw ? (JSON.parse(raw) as SurveyDraft) : null
  } catch {
    return null
  }
}

export function clearSurveyDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY)
  } catch {
    /* ignore */
  }
}

interface SurveyResponseRow {
  in_game_name: string
  answers: SurveyAnswers
  comment: string | null
}

/** The signed-in visitor's own previously-submitted response, if any (lets them come back and edit before the reveal). */
export async function fetchMySurveyResponse(userId: string): Promise<SurveyDraft | null> {
  if (!supabase) return null
  const { data } = await supabase
    .from('cyn_survey_responses')
    .select('in_game_name, answers, comment')
    .eq('user_id', userId)
    .maybeSingle()
  if (!data) return null
  const row = data as SurveyResponseRow
  return { inGameName: row.in_game_name, answers: row.answers, comment: row.comment ?? '' }
}

export async function submitSurvey(params: {
  userId: string
  inGameName: string
  discordUsername: string
  answers: SurveyAnswers
  comment: string
}): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Survey backend is not configured.' }
  const validationError = validateAnswers(params.answers)
  if (validationError) return { ok: false, error: validationError }

  const { error } = await supabase.from('cyn_survey_responses').upsert(
    {
      user_id: params.userId,
      in_game_name: params.inGameName.trim(),
      discord_username: params.discordUsername,
      answers: cleanAnswers(params.answers),
      comment: params.comment.trim() || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  )
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// ── Admin-only results (see SurveyResults.tsx) ──────────────────────────────

export interface SurveyResponseSummary {
  inGameName: string
  discordUsername: string | null
  answers: SurveyAnswers
  comment: string | null
  createdAt: string
}

/**
 * Every response, admin-only (RLS restricts this to cyn_event_admins - see
 * schema.sql). Not paginated: a community poll's total respondent count is
 * nowhere near Supabase's 1000-row default page size, unlike the
 * ever-growing daily snapshot tables elsewhere on this site that DO need
 * that (see trends.ts's own comment on the same cap).
 */
export async function fetchAllSurveyResponses(): Promise<SurveyResponseSummary[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('cyn_survey_responses')
    .select('in_game_name, discord_username, answers, comment, created_at')
    .order('created_at', { ascending: true })
  if (error || !data) return []
  return (data as (SurveyResponseRow & { discord_username: string | null; created_at: string })[]).map((r) => ({
    inGameName: r.in_game_name,
    discordUsername: r.discord_username,
    answers: r.answers,
    comment: r.comment,
    createdAt: r.created_at,
  }))
}

export interface TallyEntry {
  name: string
  count: number
}

/** Every nominee for one question, ranked by how many respondents named them (case-insensitive; the most-common casing seen is kept for display). */
export function tallyQuestion(responses: SurveyResponseSummary[], questionId: string): TallyEntry[] {
  const countByLower = new Map<string, number>()
  const displayByLower = new Map<string, string>()
  for (const r of responses) {
    for (const name of r.answers[questionId] ?? []) {
      const lower = name.toLowerCase()
      countByLower.set(lower, (countByLower.get(lower) ?? 0) + 1)
      if (!displayByLower.has(lower)) displayByLower.set(lower, name)
    }
  }
  return [...countByLower.entries()]
    .map(([lower, count]) => ({ name: displayByLower.get(lower)!, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}
