// The player survey: questions, the calls to /api/poll (worker/sitePoll.js) and the tally for the admin results.
// Until an admin releases it (button on the page), only admins can see, answer and read it.
// A new survey: change the questions below and POLL_ID in worker/sitePoll.js (old answers stay under the old id).

export type Lang = { de: string; en: string }
export interface PollOption extends Lang {
  id: string
}
export type PollQuestion =
  | ({ id: string; kind: 'single' | 'multi'; options: PollOption[] } & { q: Lang; hint?: Lang })
  | ({ id: string; kind: 'scale'; low: Lang; high: Lang } & { q: Lang; hint?: Lang })
  | ({ id: string; kind: 'text'; max: number } & { q: Lang; hint?: Lang })

export type PollAnswer = string | number | string[]
export type PollAnswers = Record<string, PollAnswer>

const opt = (id: string, de: string, en: string): PollOption => ({ id, de, en })

export const POLL_TITLE: Lang = { de: 'Deine Meinung zu OpenFront und zum Clan', en: 'Your say on OpenFront and the clan' }
export const POLL_INTRO: Lang = {
  de: 'Ein paar kurze Fragen, dauert etwa 2 Minuten. Wir wollen wissen, wie es dir aktuell im Spiel geht und was wir im Clan und auf der Seite besser machen können. Die Auswertung zeigt keine Namen.',
  en: 'A few short questions, about 2 minutes. We want to know how the game feels for you right now and what we can do better in the clan and on the site. The results show no names.',
}

export const POLL_QUESTIONS: PollQuestion[] = [
  {
    id: 'freq',
    kind: 'single',
    q: { de: 'Wie oft spielst du OpenFront gerade?', en: 'How often do you play OpenFront right now?' },
    options: [opt('daily', 'Fast täglich', 'Almost every day'), opt('weekly3', '3-5 Tage pro Woche', '3-5 days a week'), opt('weekly1', '1-2 Tage pro Woche', '1-2 days a week'), opt('rare', 'Seltener', 'Less often')],
  },
  {
    id: 'change',
    kind: 'single',
    q: { de: 'Hat sich das seit dem Sommer verändert?', en: 'Has that changed since the summer?' },
    options: [opt('more', 'Ich spiele mehr', 'I play more'), opt('same', 'Etwa gleich', 'About the same'), opt('less', 'Ich spiele weniger', 'I play less'), opt('new', 'Ich bin erst seit kurzem dabei', 'I only just started')],
  },
  {
    id: 'why_less',
    kind: 'multi',
    q: { de: 'Falls du weniger spielst: woran liegt es?', en: 'If you play less: why?' },
    hint: { de: 'Mehrere Antworten möglich, sonst einfach überspringen.', en: 'Pick as many as fit, or skip it.' },
    options: [
      opt('updates', 'Die letzten Updates und Regeländerungen', 'The latest updates and rule changes'),
      opt('ranked', 'Ranked (Wartezeit, Gegner, Rating)', 'Ranked (queue time, opponents, rating)'),
      opt('players', 'Zu wenig Mitspieler zu meiner Zeit', 'Too few players at my times'),
      opt('meta', 'Das Spiel ist mir zu eintönig geworden', 'The game feels repetitive'),
      opt('fair', 'Unfaire Spiele (Bündnisse, Teaming, Cheats)', 'Unfair games (alliances, teaming, cheats)'),
      opt('time', 'Keine Zeit', 'No time'),
      opt('other_games', 'Ich spiele etwas anderes', 'I play something else'),
    ],
  },
  {
    id: 'modes',
    kind: 'multi',
    q: { de: 'Was spielst du am liebsten?', en: 'What do you like to play most?' },
    options: [
      opt('ffa', 'Öffentliche FFA', 'Public FFA'),
      opt('team', 'Team-Spiele', 'Team games'),
      opt('r1v1', 'Ranked 1v1', 'Ranked 1v1'),
      opt('r2v2', 'Ranked 2v2', 'Ranked 2v2'),
      opt('rffa', 'FFA Rating', 'FFA Rating'),
      opt('private', 'Private Lobbys mit dem Clan', 'Private lobbies with the clan'),
      opt('solo', 'Solo gegen KI', 'Solo against the AI'),
    ],
  },
  {
    id: 'more',
    kind: 'multi',
    q: { de: 'Was würde dich öfter spielen lassen?', en: 'What would make you play more often?' },
    options: [
      opt('nights', 'Feste Clan-Spielabende', 'Regular clan game nights'),
      opt('tournaments', 'Turniere und Ligen', 'Tournaments and leagues'),
      opt('events', 'Mehr Events mit Preisen', 'More events with prizes'),
      opt('friends', 'Mehr Mitspieler aus dem Clan zur gleichen Zeit', 'More clan members online at the same time'),
      opt('stats', 'Mehr Statistiken und Ziele auf der Seite', 'More stats and goals on the site'),
      opt('balance', 'Bessere Balance im Spiel', 'Better game balance'),
    ],
  },
  {
    id: 'site',
    kind: 'scale',
    q: { de: 'Wie nützlich ist cynclan.com für dich?', en: 'How useful is cynclan.com for you?' },
    low: { de: 'Gar nicht', en: 'Not at all' },
    high: { de: 'Sehr', en: 'Very' },
  },
  { id: 'missing', kind: 'text', max: 500, q: { de: 'Was fehlt dir auf der Seite oder im Clan?', en: 'What is missing on the site or in the clan?' } },
  { id: 'free', kind: 'text', max: 500, q: { de: 'Sonst noch etwas, das wir wissen sollten?', en: 'Anything else we should know?' } },
]

export interface PollState {
  /** the caller may see and fill in the survey (admins always, everybody else once it is released) */
  visible: boolean
  admin: boolean
  /** released to every member */
  open: boolean
  member: boolean
  mine: PollAnswers | null
}

export async function fetchPoll(): Promise<PollState | null> {
  try {
    const res = await fetch('/api/poll', { credentials: 'same-origin' })
    return res.ok ? ((await res.json()) as PollState) : null
  } catch {
    return null
  }
}

/** null = saved, else a short reason code from the server (not_open, members_only, bad_answers, ...). */
export async function submitPoll(answers: PollAnswers): Promise<string | null> {
  try {
    const res = await fetch('/api/poll', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers }) })
    if (res.ok) return null
    return ((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? 'failed'
  } catch {
    return 'failed'
  }
}

export async function setPollOpen(open: boolean): Promise<boolean> {
  try {
    const res = await fetch('/api/poll/config', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ open }) })
    return res.ok
  } catch {
    return false
  }
}

export async function fetchPollResults(): Promise<{ count: number; answers: { answers: PollAnswers; at: string | null }[] } | null> {
  try {
    const res = await fetch('/api/poll/results', { credentials: 'same-origin' })
    return res.ok ? await res.json() : null
  } catch {
    return null
  }
}

/** The answers worth sending: choices that exist, a rating, a trimmed text. Empty questions are dropped. */
export function cleanForSubmit(answers: PollAnswers): PollAnswers {
  const out: PollAnswers = {}
  for (const q of POLL_QUESTIONS) {
    const a = answers[q.id]
    if (q.kind === 'single' && typeof a === 'string' && q.options.some((o) => o.id === a)) out[q.id] = a
    else if (q.kind === 'multi' && Array.isArray(a)) {
      const picked = q.options.filter((o) => a.includes(o.id)).map((o) => o.id)
      if (picked.length) out[q.id] = picked
    } else if (q.kind === 'scale' && typeof a === 'number' && a >= 1 && a <= 5) out[q.id] = Math.round(a)
    else if (q.kind === 'text' && typeof a === 'string' && a.trim()) out[q.id] = a.trim().slice(0, q.max)
  }
  return out
}

export interface OptionTally {
  id: string
  label: Lang
  count: number
}
export type QuestionTally =
  | { id: string; kind: 'single' | 'multi'; answered: number; options: OptionTally[] }
  | { id: string; kind: 'scale'; answered: number; average: number | null; counts: number[] }
  | { id: string; kind: 'text'; answered: number; texts: string[] }

/** Counts per option, the rating average and the free texts of all answers (newest texts first, as the server lists them). */
export function tally(all: PollAnswers[]): QuestionTally[] {
  return POLL_QUESTIONS.map((q): QuestionTally => {
    const given = all.map((a) => a[q.id]).filter((v) => v !== undefined)
    if (q.kind === 'single' || q.kind === 'multi') {
      const options = q.options.map((o) => ({ id: o.id, label: { de: o.de, en: o.en }, count: given.filter((v) => (Array.isArray(v) ? v.includes(o.id) : v === o.id)).length }))
      return { id: q.id, kind: q.kind, answered: given.length, options }
    }
    if (q.kind === 'scale') {
      const nums = given.filter((v): v is number => typeof v === 'number')
      const counts = [1, 2, 3, 4, 5].map((n) => nums.filter((v) => v === n).length)
      return { id: q.id, kind: 'scale', answered: nums.length, average: nums.length ? nums.reduce((s, v) => s + v, 0) / nums.length : null, counts }
    }
    return { id: q.id, kind: 'text', answered: given.length, texts: given.filter((v): v is string => typeof v === 'string') }
  })
}
