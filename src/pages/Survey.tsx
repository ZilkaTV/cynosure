import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useSession, useIsAdmin, discordDisplayName } from '../lib/useSession'
import { Card, SectionHeading, Spinner } from '../components/ui'
import {
  SURVEY_CATEGORIES,
  ANSWERS_PER_QUESTION,
  validateAnswers,
  saveSurveyDraft,
  loadSurveyDraft,
  clearSurveyDraft,
  fetchMySurveyResponse,
  submitSurvey,
  type SurveyAnswers,
} from '../lib/survey'

const REVEAL_DATE = 'Saturday, September 26th 2026, 20:00 CEST (German time)'
const STREAM_URL = 'https://www.twitch.tv/ZilkaCYN'

const DiscordIcon = ({ className = 'h-5 w-5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M20.317 4.369A19.79 19.79 0 0 0 15.885 3c-.213.38-.462.893-.634 1.301a18.27 18.27 0 0 0-5.5 0A12.6 12.6 0 0 0 9.115 3a19.74 19.74 0 0 0-4.435 1.371C1.4 9.043.65 13.6.925 18.096a19.9 19.9 0 0 0 6.06 3.06c.49-.665.926-1.372 1.302-2.115a12.9 12.9 0 0 1-2.049-.98c.172-.125.34-.256.503-.392a14.19 14.19 0 0 0 12.516 0c.166.14.334.27.503.392-.65.385-1.336.71-2.052.982.377.742.812 1.45 1.303 2.114a19.83 19.83 0 0 0 6.064-3.06c.323-5.218-.552-9.735-2.758-13.727ZM8.68 15.331c-1.017 0-1.85-.933-1.85-2.081 0-1.148.815-2.082 1.85-2.082 1.044 0 1.867.943 1.85 2.082 0 1.148-.815 2.081-1.85 2.081Zm6.646 0c-1.017 0-1.85-.933-1.85-2.081 0-1.148.815-2.082 1.85-2.082 1.044 0 1.867.943 1.85 2.082 0 1.148-.806 2.081-1.85 2.081Z" />
  </svg>
)

function emptyAnswers(): SurveyAnswers {
  const a: SurveyAnswers = {}
  for (const cat of SURVEY_CATEGORIES) for (const q of cat.questions) a[q.id] = Array(ANSWERS_PER_QUESTION).fill('')
  return a
}

export default function Survey() {
  const session = useSession()
  const isAdmin = useIsAdmin()

  const [step, setStep] = useState<'name' | 'questions'>('name')
  const [inGameName, setInGameName] = useState('')
  const [answers, setAnswers] = useState<SurveyAnswers>(emptyAnswers())
  const [comment, setComment] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [restoring, setRestoring] = useState(true)

  // Restores a draft saved right before a Discord redirect (or just a page
  // refresh mid-survey) - and, failing that, an already-submitted response
  // for this signed-in visitor, so coming back to this page never means
  // starting over from a blank form.
  useEffect(() => {
    let alive = true
    ;(async () => {
      const draft = loadSurveyDraft()
      if (draft) {
        if (!alive) return
        setInGameName(draft.inGameName)
        setAnswers({ ...emptyAnswers(), ...draft.answers })
        setComment(draft.comment)
        setStep('questions')
        setRestoring(false)
        return
      }
      if (session) {
        const existing = await fetchMySurveyResponse(session.user.id)
        if (!alive) return
        if (existing) {
          setInGameName(existing.inGameName)
          setAnswers({ ...emptyAnswers(), ...existing.answers })
          setComment(existing.comment)
          setStep('questions')
        }
      }
      if (alive) setRestoring(false)
    })()
    return () => {
      alive = false
    }
  }, [session])

  function setSlot(questionId: string, index: number, value: string) {
    setAnswers((prev) => {
      const next = [...(prev[questionId] ?? Array(ANSWERS_PER_QUESTION).fill(''))]
      next[index] = value
      return { ...prev, [questionId]: next }
    })
  }

  function goToQuestions(e: React.FormEvent) {
    e.preventDefault()
    if (!inGameName.trim()) {
      setError('Please enter your OpenFront in-game name.')
      return
    }
    setError(null)
    setStep('questions')
  }

  async function onSubmit() {
    setError(null)
    const validationError = validateAnswers(answers)
    if (validationError) {
      setError(validationError)
      return
    }

    if (!session) {
      // Saved BEFORE the Discord redirect - see saveSurveyDraft's own comment.
      saveSurveyDraft({ inGameName, answers, comment })
      supabase?.auth.signInWithOAuth({
        provider: 'discord',
        options: { redirectTo: `${window.location.origin}/survey`, scopes: 'identify' },
      })
      return
    }

    setBusy(true)
    const result = await submitSurvey({
      userId: session.user.id,
      inGameName,
      discordUsername: discordDisplayName(session),
      answers,
      comment,
    })
    setBusy(false)
    if (!result.ok) {
      setError(result.error ?? 'Something went wrong - please try again.')
      return
    }
    clearSurveyDraft()
    setSubmitted(true)
  }

  if (restoring) {
    return <Spinner label="Loading survey..." />
  }

  if (submitted) {
    return (
      <div className="mx-auto max-w-xl text-center">
        <SectionHeading eyebrow="Community Awards" title="Thank you for participating!" />
        <Card className="mt-2">
          <p className="text-slate-300">
            The results will be revealed on <span className="font-semibold text-white">{REVEAL_DATE}</span> on the following stream:
          </p>
          <a
            href={STREAM_URL}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#9146FF] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#7c2ff2]"
          >
            {STREAM_URL.replace('https://www.', '')}
          </a>
        </Card>
        <Link to="/" className="mt-6 inline-block text-sm text-slate-400 hover:text-accent-light">
          ← Back to overview
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl">
      <SectionHeading eyebrow="Community Awards" title="OpenFront Survey" />
      <p className="-mt-4 mb-6 max-w-xl text-sm text-slate-400">
        Open to everyone, not just [CYN] members. Nominate whoever you think deserves it in each category - up to 5 names per
        question.
      </p>

      {step === 'name' && (
        <Card>
          <form className="space-y-5" onSubmit={goToQuestions}>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">
                Your OpenFront in-game name <span className="text-signal-red">*</span>
              </label>
              <input
                required
                value={inGameName}
                onChange={(e) => setInGameName(e.target.value)}
                placeholder="e.g. Bane"
                className="w-full rounded-lg border border-base-600 bg-base-800 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-accent focus:outline-none"
              />
            </div>
            {error && (
              <div className="rounded-lg border border-signal-red/40 bg-signal-red/10 px-4 py-3 text-sm text-signal-red">{error}</div>
            )}
            <button type="submit" className="btn-accent">
              Start survey
            </button>
          </form>
        </Card>
      )}

      {step === 'questions' && (
        <div className="space-y-6">
          <p className="text-sm text-slate-500">
            All 5 slots per question (<span className="text-signal-red">*</span>) are required. The same name can appear in
            different questions, just not twice within the same one.
          </p>
          {error && (
            <div className="rounded-lg border border-signal-red/40 bg-signal-red/10 px-4 py-3 text-sm text-signal-red">{error}</div>
          )}
          {SURVEY_CATEGORIES.map((cat) => (
            <Card key={cat.id}>
              <h2 className="mb-4 font-display text-lg font-bold text-white">{cat.title}</h2>
              <div className="space-y-5">
                {cat.questions.map((q) => (
                  <div key={q.id}>
                    <p className="mb-2 text-sm font-medium text-slate-300">
                      {q.text} <span className="text-signal-red">*</span>
                    </p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
                      {Array.from({ length: ANSWERS_PER_QUESTION }, (_, i) => (
                        <input
                          key={i}
                          required
                          value={answers[q.id]?.[i] ?? ''}
                          onChange={(e) => setSlot(q.id, i, e.target.value)}
                          placeholder="Name"
                          maxLength={32}
                          className="w-full rounded-lg border border-base-600 bg-base-800 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-accent focus:outline-none"
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}

          <Card>
            <label className="mb-1.5 block text-sm font-medium text-slate-300">
              Anything else you'd like to mention? <span className="text-slate-500">(optional)</span>
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
              className="w-full resize-y rounded-lg border border-base-600 bg-base-800 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-accent focus:outline-none"
            />
          </Card>

          {error && (
            <div className="rounded-lg border border-signal-red/40 bg-signal-red/10 px-4 py-3 text-sm text-signal-red">{error}</div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setStep('name')}
              className="btn-ghost"
            >
              ← Back
            </button>
            {session ? (
              <button type="button" onClick={onSubmit} disabled={busy} className="btn-accent disabled:opacity-60">
                {busy ? 'Submitting...' : 'Submit survey'}
              </button>
            ) : (
              <button
                type="button"
                onClick={onSubmit}
                className="inline-flex items-center gap-2 rounded-lg bg-[#5865F2] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#4752c4]"
              >
                <DiscordIcon className="h-4 w-4" /> Sign in with Discord to submit
              </button>
            )}
            {isAdmin && (
              <Link to="/survey/results" className="btn-ghost">
                Results
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
