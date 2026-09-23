import { useEffect, useState } from 'react'
import { useIsAdmin } from '../lib/useSession'
import { Card, SectionHeading, Spinner } from '../components/ui'
import { SURVEY_CATEGORIES, fetchAllSurveyResponses, tallyQuestion, type SurveyResponseSummary } from '../lib/survey'

const EyeIcon = ({ className = 'h-4 w-4' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

const EyeOffIcon = ({ className = 'h-4 w-4' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a20.3 20.3 0 0 1 5.06-5.94M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a20.3 20.3 0 0 1-3.22 4.44M14.12 14.12a3 3 0 1 1-4.24-4.24" />
    <path d="M1 1l22 22" />
  </svg>
)

// Fixed-width mask, same for every hidden value regardless of the real
// text's length - a blurred-but-still-real-length string (the previous
// approach) leaks information on its own: a 3-letter name and a 12-letter
// name are visibly different widths even blurred, which is enough for
// someone to start guessing before the eye is ever clicked.
const HIDDEN_PLACEHOLDER = '••••••••'

// Two INDEPENDENT reveal toggles per row (name / count), for building suspense
// during the stream reveal - clicking one never gives away the other.
function RevealButton({ revealed, onToggle, text }: { revealed: boolean; onToggle: () => void; text: string }) {
  return (
    <button
      onClick={onToggle}
      className={`inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-left transition-colors ${
        revealed ? 'text-white' : 'text-slate-600 hover:text-slate-400'
      }`}
    >
      {revealed ? <EyeIcon className="h-3.5 w-3.5 shrink-0" /> : <EyeOffIcon className="h-3.5 w-3.5 shrink-0" />}
      <span className={revealed ? '' : 'select-none tracking-widest'}>{revealed ? text : HIDDEN_PLACEHOLDER}</span>
    </button>
  )
}

// Shared by every reveal toggle on this page (question rows + comment
// author names) - a plain immutable toggle over a Set of revealed indices.
function toggleIndex(set: Set<number>, setter: (s: Set<number>) => void, i: number) {
  const next = new Set(set)
  if (next.has(i)) next.delete(i)
  else next.add(i)
  setter(next)
}

const TOP_N_DEFAULT = 5

function QuestionResults({ questionId, questionText, responses }: { questionId: string; questionText: string; responses: SurveyResponseSummary[] }) {
  const tally = tallyQuestion(responses, questionId)
  const [revealedNames, setRevealedNames] = useState<Set<number>>(new Set())
  const [revealedCounts, setRevealedCounts] = useState<Set<number>>(new Set())
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? tally : tally.slice(0, TOP_N_DEFAULT)

  if (tally.length === 0) {
    return (
      <div className="border-b border-base-700/50 py-3 last:border-0">
        <p className="text-sm font-medium text-slate-300">{questionText}</p>
        <p className="mt-1 text-xs text-slate-600">No nominations yet.</p>
      </div>
    )
  }

  return (
    <div className="border-b border-base-700/50 py-3 last:border-0">
      <p className="mb-2 text-sm font-medium text-slate-300">{questionText}</p>
      <ol className="space-y-1">
        {visible.map((entry, i) => (
          <li key={i} className="flex items-center gap-3 text-sm">
            <span className="w-5 shrink-0 text-right text-slate-600">{i + 1}.</span>
            <RevealButton
              revealed={revealedNames.has(i)}
              onToggle={() => toggleIndex(revealedNames, setRevealedNames, i)}
              text={entry.name}
            />
            <span className="text-slate-700">·</span>
            <RevealButton
              revealed={revealedCounts.has(i)}
              onToggle={() => toggleIndex(revealedCounts, setRevealedCounts, i)}
              text={`${entry.count} ${entry.count === 1 ? 'vote' : 'votes'}`}
            />
          </li>
        ))}
      </ol>
      {tally.length > TOP_N_DEFAULT && (
        <button onClick={() => setShowAll((s) => !s)} className="mt-2 text-xs font-semibold text-accent hover:text-accent-light">
          {showAll ? 'Show top 5 only' : `Show all ${tally.length}`}
        </button>
      )}
    </div>
  )
}

function CommentsSection({ responses }: { responses: SurveyResponseSummary[] }) {
  const commented = responses.filter((r) => r.comment)
  const [revealedNames, setRevealedNames] = useState<Set<number>>(new Set())

  if (commented.length === 0) return null

  return (
    <Card>
      <h2 className="mb-3 font-display text-lg font-bold text-white">Additional comments</h2>
      <div className="space-y-3">
        {commented.map((r, i) => (
          <div key={i} className="rounded-lg bg-base-800 px-3.5 py-2.5 text-sm">
            <div className="mb-1 text-xs font-semibold">
              <RevealButton
                revealed={revealedNames.has(i)}
                onToggle={() => toggleIndex(revealedNames, setRevealedNames, i)}
                text={r.inGameName}
              />
            </div>
            <p className="whitespace-pre-wrap text-slate-300">{r.comment}</p>
          </div>
        ))}
      </div>
    </Card>
  )
}

export default function SurveyResults() {
  const isAdmin = useIsAdmin()
  const [responses, setResponses] = useState<SurveyResponseSummary[] | null>(null)

  useEffect(() => {
    if (isAdmin) fetchAllSurveyResponses().then(setResponses)
  }, [isAdmin])

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <p className="text-slate-400">Admins only.</p>
      </div>
    )
  }

  if (responses === null) return <Spinner />

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <SectionHeading center eyebrow="Community Awards" title="Survey results" />
      <p className="text-center text-sm text-slate-500">
        {responses.length} {responses.length === 1 ? 'response' : 'responses'} · click the eye icons to reveal a name or its vote
        count independently, for the stream.
      </p>

      {SURVEY_CATEGORIES.map((cat) => (
        <Card key={cat.id}>
          <h2 className="mb-1 font-display text-lg font-bold text-white">{cat.title}</h2>
          <div>
            {cat.questions.map((q) => (
              <QuestionResults key={q.id} questionId={q.id} questionText={q.text} responses={responses} />
            ))}
          </div>
        </Card>
      ))}

      <CommentsSection responses={responses} />
    </div>
  )
}
