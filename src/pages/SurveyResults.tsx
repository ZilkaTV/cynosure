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

// Two INDEPENDENT reveal toggles per row (name / count), for building suspense
// during the stream reveal - clicking one never gives away the other.
function RevealButton({ revealed, onToggle, children }: { revealed: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onToggle}
      className={`inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-left transition-colors ${
        revealed ? 'text-white' : 'text-slate-600 hover:text-slate-400'
      }`}
    >
      {revealed ? <EyeIcon className="h-3.5 w-3.5 shrink-0" /> : <EyeOffIcon className="h-3.5 w-3.5 shrink-0" />}
      <span className={revealed ? '' : 'blur-sm select-none'}>{children}</span>
    </button>
  )
}

function QuestionResults({ questionId, questionText, responses }: { questionId: string; questionText: string; responses: SurveyResponseSummary[] }) {
  const tally = tallyQuestion(responses, questionId)
  const [revealedNames, setRevealedNames] = useState<Set<number>>(new Set())
  const [revealedCounts, setRevealedCounts] = useState<Set<number>>(new Set())

  function toggle(set: Set<number>, setter: (s: Set<number>) => void, i: number) {
    const next = new Set(set)
    if (next.has(i)) next.delete(i)
    else next.add(i)
    setter(next)
  }

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
        {tally.map((entry, i) => (
          <li key={i} className="flex items-center gap-3 text-sm">
            <span className="w-5 shrink-0 text-right text-slate-600">{i + 1}.</span>
            <RevealButton revealed={revealedNames.has(i)} onToggle={() => toggle(revealedNames, setRevealedNames, i)}>
              {entry.name}
            </RevealButton>
            <span className="text-slate-700">·</span>
            <RevealButton revealed={revealedCounts.has(i)} onToggle={() => toggle(revealedCounts, setRevealedCounts, i)}>
              {entry.count} {entry.count === 1 ? 'vote' : 'votes'}
            </RevealButton>
          </li>
        ))}
      </ol>
    </div>
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

      {responses.some((r) => r.comment) && (
        <Card>
          <h2 className="mb-3 font-display text-lg font-bold text-white">Additional comments</h2>
          <div className="space-y-3">
            {responses
              .filter((r) => r.comment)
              .map((r, i) => (
                <div key={i} className="rounded-lg bg-base-800 px-3.5 py-2.5 text-sm">
                  <p className="mb-1 text-xs font-semibold text-slate-500">{r.inGameName}</p>
                  <p className="whitespace-pre-wrap text-slate-300">{r.comment}</p>
                </div>
              ))}
          </div>
        </Card>
      )}
    </div>
  )
}
