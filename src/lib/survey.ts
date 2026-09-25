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
export interface AnswerProblem {
  message: string
  questionId: string
  /** Which of the question's name slots are at fault (all of them for a too-short answer list). */
  slots: number[]
}

/** Same checks as validateAnswers, but says WHICH question and slots are wrong so the form can outline them. */
export function findAnswerProblem(answers: SurveyAnswers): AnswerProblem | null {
  for (const q of ALL_SURVEY_QUESTIONS) {
    const raw = answers[q.id] ?? []
    const slots = Array.from({ length: ANSWERS_PER_QUESTION }, (_, i) => (raw[i] ?? '').trim())
    const empty = slots.flatMap((s, i) => (s ? [] : [i]))
    if (empty.length > 0) {
      return { message: `Please fill in all ${ANSWERS_PER_QUESTION} name slots for: "${q.text}"`, questionId: q.id, slots: empty }
    }
    for (const [i, name] of slots.entries()) {
      if (name.length > MAX_NAME_LENGTH) return { message: `"${name}" is too long (max ${MAX_NAME_LENGTH} characters).`, questionId: q.id, slots: [i] }
      if (!NAME_PATTERN.test(name)) {
        return {
          message: `"${name}" contains a character that isn't allowed (letters, numbers, "_", "-" and "[]" only, no spaces).`,
          questionId: q.id,
          slots: [i],
        }
      }
      if (isJunkAnswer(name)) {
        return { message: `"${name}" isn't a real nominee - please enter an actual player/clan name for "${q.text}".`, questionId: q.id, slots: [i] }
      }
    }
    // Alias-aware: "Zixer" and "Zixer2" (or "Rex" and "Ultimus_rex") are the
    // same person, so naming both would just waste one of the three slots.
    const seen = new Map<string, number>()
    for (const [i, name] of slots.entries()) {
      const key = nomineeKey(name, q.id.startsWith('clans_'))
      const earlierIndex = seen.get(key)
      if (earlierIndex !== undefined) {
        const earlier = slots[earlierIndex]
        return {
          message:
            earlier.toLowerCase() === name.toLowerCase()
              ? `You entered the same name twice for "${q.text}".`
              : `"${earlier}" and "${name}" are the same nominee - please enter a different name for "${q.text}".`,
          questionId: q.id,
          slots: [earlierIndex, i],
        }
      }
      seen.set(key, i)
    }
  }
  return null
}

export function validateAnswers(answers: SurveyAnswers): string | null {
  return findAnswerProblem(answers)?.message ?? null
}

/** Trims every slot and rewrites known spelling variants to their canonical name before saving - validateAnswers already guarantees every slot is filled by the time this runs. */
function cleanAnswers(answers: SurveyAnswers): SurveyAnswers {
  const cleaned: SurveyAnswers = {}
  for (const q of ALL_SURVEY_QUESTIONS) {
    cleaned[q.id] = (answers[q.id] ?? []).map((s) => canonicalDisplayName(s.trim(), q.id.startsWith('clans_')))
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

/** Non-answers ("idk", "none", ...) - dropped from the results entirely, compared via simpleKey. */
const JUNK_ANSWERS = new Set(
  [
    'idk', 'idkn', 'dont', 'dontknow', 'idontknow', 'dunno', 'dk', 'any', 'blank', 'none', 'na', 'nobody', 'noone', 'nothing', 'unknown',
    'me', 'myself', 'community', 'everyone', 'everybody', 'idc', 'nah', 'test', 'asd', 'asdf', 'qwerty',
  ],
)

/**
 * Nominees people spelled differently (typos, shortened names, numbered
 * variants), first entry of each group = the name shown in the results.
 * Hand-curated on purpose rather than fuzzy-matched - an automatic
 * similarity threshold would eventually merge two genuinely different
 * players.
 */
const NAME_ALIAS_GROUPS: string[][] = [
  ['cosmicvoidarchon', 'cosmic', 'cosmicvoid'],
  ['alt_number_3', 'alt_3', 'alt_number3', 'alt'],
  ['ashfalllive', 'ashfall', 'ash'],
  ['Zixer', 'Zixer1', 'Zixer2'],
  ['lewis', 'iamlewis'],
  ['Nebula', 'nebulaxy', 'nebualxy'],
  ['jadedrose', 'JadedRose', 'Jaddedrose', 'jadded', 'jaded'],
  ['UltimusRex', 'Rex', 'Ultimus', 'Ultimus_Red'],
  ['Biffeur', 'biff', 'TheBiffeur'],
  ['Vari', 'Vari_vari', 'Vari_vari_vari'],
  ['Dougy', 'DougyJr', 'Dougy2', 'Doogy', 'DougDoug'],
  ['LonelyMillenial', 'lonley_millenial', 'Lonnely', 'Millenial'],
  ['Nikas', 'Nikas1', 'Nikas2'],
  ['Zorbix', 'Zorbit'],
  ['Professor_SPloyer', 'Proffesorsployer', 'sployer'],
  ['Skailex', 'Skaillex'],
  ['Space_Sheep', 'Space_Sheeep'],
]

/** Case-insensitive, ignoring brackets/underscores/hyphens/spaces - "Ultimus_rex" and "UltimusRex" are the same key. */
function simpleKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

const ALIAS_CANONICAL = new Map<string, { key: string; display: string }>()
for (const [canonical, ...aliases] of NAME_ALIAS_GROUPS) {
  const entry = { key: simpleKey(canonical), display: canonical }
  ALIAS_CANONICAL.set(entry.key, entry)
  for (const a of aliases) ALIAS_CANONICAL.set(simpleKey(a), entry)
}

/** Trailing digits dropped - "idk2", "idk3" and "Zixer2" are numbered variants of the base word. */
function stripTrailingDigits(simple: string): string {
  return simple.replace(/[0-9]+$/, '')
}

function editDistanceAtMost1(a: string, b: string): boolean {
  if (a === b) return true
  if (Math.abs(a.length - b.length) > 1) return false
  const [short, long] = a.length <= b.length ? [a, b] : [b, a]
  let i = 0
  while (i < short.length && short[i] === long[i]) i++
  if (short.length === long.length) return short.slice(i + 1) === long.slice(i + 1)
  return short.slice(i) === long.slice(i + 1)
}

/**
 * Alias group for a spelling: exact match, then with trailing digits
 * dropped, then a single-character typo of a long-enough alias (>= 6 chars,
 * so short names like "Rex" can never fuzzy-match something else).
 */
function lookupAlias(simple: string): { key: string; display: string } | undefined {
  const exact = ALIAS_CANONICAL.get(simple)
  if (exact) return exact
  const stripped = stripTrailingDigits(simple)
  const strippedHit = stripped ? ALIAS_CANONICAL.get(stripped) : undefined
  if (strippedHit) return strippedHit
  for (const candidate of new Set([simple, stripped])) {
    if (candidate.length < 6) continue
    for (const [aliasKey, entry] of ALIAS_CANONICAL) {
      if (aliasKey.length >= 6 && editDistanceAtMost1(candidate, aliasKey)) return entry
    }
  }
  return undefined
}

/**
 * Non-answers: known filler words (also numbered, "idk2"), anything of one or
 * two characters ("a", "s", "ss"), one repeated character ("aaa", "xxxx") and
 * pure digits. Nobody's real nominee is that short or patterned - a genuine
 * 2-letter name would have to be spelled out longer to count.
 */
export function isJunkAnswer(name: string): boolean {
  const simple = simpleKey(name)
  if (simple.length <= 2) return true
  if (/^(.)\1*$/.test(simple) || /^[0-9]+$/.test(simple)) return true
  return JUNK_ANSWERS.has(simple) || JUNK_ANSWERS.has(stripTrailingDigits(simple))
}

/** Identity of a nominee for duplicate checks and tallying: the alias group's key if it belongs to one, else its simple key. */
function nomineeKey(name: string, isClanQuestion = false): string {
  const simple = simpleKey(name)
  return (isClanQuestion ? undefined : lookupAlias(simple))?.key ?? simple
}

function canonicalDisplayName(name: string, isClanQuestion = false): string {
  return (isClanQuestion ? undefined : lookupAlias(simpleKey(name)))?.display ?? name
}

/**
 * The name aliases above are all PLAYER spellings, so they don't apply to the
 * clan questions (where "ash" is the real clan tag [ASH], not a short form of
 * the player ashfalllive). A player's own name given as a "clan" is dropped
 * from the clan questions' suggestions and results instead.
 */
const PLAYER_NAMES_NOT_CLANS = new Set(['ashfalllive', 'ashfall'])

/**
 * Every nominee for one question, ranked by how many respondents named them.
 * Non-answers are dropped, spelling variants of the same nominee are merged
 * (see NAME_ALIAS_GROUPS), and one respondent naming several variants of the
 * same person in one question still only counts once - the merged total is
 * the number of DIFFERENT people who voted for them.
 */
export function tallyQuestion(responses: SurveyResponseSummary[], questionId: string): TallyEntry[] {
  const countByKey = new Map<string, number>()
  const displayByKey = new Map<string, string>()
  for (const r of responses) {
    const seenThisResponse = new Set<string>()
    for (const name of r.answers[questionId] ?? []) {
      const simple = simpleKey(name)
      if (isJunkAnswer(name)) continue
      const isClanQuestion = questionId.startsWith('clans_')
      if (isClanQuestion && PLAYER_NAMES_NOT_CLANS.has(simple)) continue
      const alias = isClanQuestion ? undefined : lookupAlias(simple)
      const key = alias?.key ?? simple
      if (seenThisResponse.has(key)) continue
      seenThisResponse.add(key)
      countByKey.set(key, (countByKey.get(key) ?? 0) + 1)
      // Brackets stripped from the display name too - a clean "CYN" either
      // way, regardless of whether this particular respondent typed "CYN"
      // or "[CYN]".
      if (!displayByKey.has(key)) displayByKey.set(key, alias?.display ?? name.replace(/[[\]]/g, ''))
    }
  }
  return [...countByKey.entries()]
    .map(([key, count]) => ({ name: displayByKey.get(key)!, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

// ── Name suggestions for the form's dropdown ───────────────────────────────

/**
 * Suggested names per question id: everyone already nominated in that
 * question (names only, never counts or who voted - via the
 * cyn_survey_nominees() function, see schema.sql) - only names someone
 * actually nominated, deliberately NOT the clan roster. Best-effort: a
 * missing function or a failed query just means no suggestions, never a
 * broken form.
 */
export async function fetchSurveySuggestions(): Promise<Record<string, string[]>> {
  const byQuestion = new Map<string, Map<string, string>>()
  const add = (questionId: string, name: string) => {
    const trimmed = name.trim()
    if (!trimmed || trimmed.length > MAX_NAME_LENGTH || !NAME_PATTERN.test(trimmed) || isJunkAnswer(trimmed)) return
    const isClanQuestion = questionId.startsWith('clans_')
    if (isClanQuestion && PLAYER_NAMES_NOT_CLANS.has(simpleKey(trimmed))) return
    const display = canonicalDisplayName(trimmed, isClanQuestion).replace(/[[\]]/g, '')
    const map = byQuestion.get(questionId) ?? new Map<string, string>()
    const key = nomineeKey(display, isClanQuestion)
    if (!map.has(key)) map.set(key, display)
    byQuestion.set(questionId, map)
  }

  if (supabase) {
    const nominees = await supabase.rpc('cyn_survey_nominees')
    for (const row of (nominees.data ?? []) as { question_id: string; name: string }[]) add(row.question_id, row.name)
  }

  const result: Record<string, string[]> = {}
  for (const [questionId, map] of byQuestion) result[questionId] = [...map.values()].sort((a, b) => a.localeCompare(b))
  return result
}
