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
export const ANSWERS_PER_QUESTION = 3

/**
 * OpenFront in-game names / clan tags don't contain spaces or punctuation in
 * practice, and the request was explicit: no special characters, no spaces.
 * Letters, digits, underscore and hyphen cover every real name/tag seen on
 * the roster elsewhere on this site (see CLAN_TAG usage) without being so
 * strict a legitimate one gets rejected. Square brackets are the one
 * exception - the clan questions explicitly ask for "[TAG]" formatting, so
 * they're allowed through (and ignored for comparison, see
 * normalizeForCompare below) rather than rejected as a special character.
 */
export const NAME_PATTERN = /^[A-Za-z0-9_[\]-]+$/
export const MAX_NAME_LENGTH = 32

export type SurveyAnswers = Record<string, string[]>

/**
 * Comparison key for both the within-question duplicate check and the admin
 * tally: case-insensitive, and square brackets stripped so "CYN" and
 * "[CYN]" are recognized as the same nominee instead of splitting a clan's
 * votes across two entries just because people formatted the tag
 * differently.
 */
export function normalizeForCompare(name: string): string {
  return name.toLowerCase().replace(/[[\]]/g, '')
}

/**
 * Every slot in every question is required (all ANSWERS_PER_QUESTION, no
 * blanks) - unlike an "up to N" nomination list, this is a fixed ballot: 15
 * questions x N names each. A name can repeat across DIFFERENT questions
 * (the same person can be nominated for both "best FFA player" and "best
 * Team Games player"), but not twice within the SAME question's slots.
 */
export function validateAnswers(answers: SurveyAnswers): string | null {
  for (const q of ALL_SURVEY_QUESTIONS) {
    const raw = answers[q.id] ?? []
    const slots = raw.map((s) => s.trim())
    if (slots.length < ANSWERS_PER_QUESTION || slots.some((s) => !s)) {
      return `Please fill in all ${ANSWERS_PER_QUESTION} name slots for: "${q.text}"`
    }
    for (const name of slots) {
      if (name.length > MAX_NAME_LENGTH) return `"${name}" is too long (max ${MAX_NAME_LENGTH} characters).`
      if (!NAME_PATTERN.test(name)) return `"${name}" contains a character that isn't allowed (letters, numbers, "_", "-" and "[]" only, no spaces).`
    }
    const normalized = slots.map(normalizeForCompare)
    if (new Set(normalized).size !== normalized.length) return `You entered the same name twice for "${q.text}".`
  }
  return null
}

/** Trims every slot before saving - validateAnswers already guarantees every slot is filled by the time this runs. */
function cleanAnswers(answers: SurveyAnswers): SurveyAnswers {
  const cleaned: SurveyAnswers = {}
  for (const q of ALL_SURVEY_QUESTIONS) {
    cleaned[q.id] = (answers[q.id] ?? []).map((s) => s.trim())
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
  const countByKey = new Map<string, number>()
  const displayByKey = new Map<string, string>()
  for (const r of responses) {
    for (const name of r.answers[questionId] ?? []) {
      const key = normalizeForCompare(name)
      countByKey.set(key, (countByKey.get(key) ?? 0) + 1)
      // Brackets stripped from the display name too - a clean "CYN" either
      // way, regardless of whether this particular respondent typed "CYN"
      // or "[CYN]".
      if (!displayByKey.has(key)) displayByKey.set(key, name.replace(/[[\]]/g, ''))
    }
  }
  return [...countByKey.entries()]
    .map(([key, count]) => ({ name: displayByKey.get(key)!, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}
