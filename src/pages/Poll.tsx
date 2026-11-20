import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, SectionHeading, Spinner } from '../components/ui'
import { useLanguage } from '../i18n/LanguageContext'
import { useSession } from '../lib/useSession'
import {
  POLL_INTRO,
  POLL_QUESTIONS,
  POLL_TITLE,
  cleanForSubmit,
  fetchPoll,
  fetchPollResults,
  setPollOpen,
  submitPoll,
  tally,
  type PollAnswers,
  type PollQuestion,
  type PollState,
  type QuestionTally,
} from '../lib/poll'

function Bar({ label, count, of }: { label: string; count: number; of: number }) {
  const pct = of > 0 ? Math.round((count / of) * 100) : 0
  return (
    <li className="text-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-slate-200">{label}</span>
        <span className="shrink-0 tabular-nums text-slate-400">
          {count} <span className="text-slate-500">· {pct}%</span>
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-base-700">
        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
    </li>
  )
}

/** Admin only: how the answers came out, per question. */
function Results({ de }: { de: boolean }) {
  const [data, setData] = useState<{ count: number; answers: { answers: PollAnswers }[] } | null | undefined>(undefined)
  useEffect(() => {
    let alive = true
    fetchPollResults().then((r) => alive && setData(r))
    return () => {
      alive = false
    }
  }, [])
  const rows = useMemo(() => (data ? tally(data.answers.map((a) => a.answers)) : []), [data])
  if (data === undefined) return <Spinner />
  if (!data) return <p className="text-sm text-slate-500">{de ? 'Auswertung konnte nicht geladen werden.' : 'Could not load the results.'}</p>
  if (data.count === 0) return <p className="rounded-xl border border-base-700 bg-base-850/40 px-4 py-6 text-center text-sm text-slate-500">{de ? 'Noch keine Antworten.' : 'No answers yet.'}</p>
  const byId = new Map<string, QuestionTally>(rows.map((r) => [r.id, r]))
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">
        <span className="font-display text-2xl font-bold text-white">{data.count}</span> {de ? (data.count === 1 ? 'Antwort' : 'Antworten') : data.count === 1 ? 'answer' : 'answers'}
      </p>
      {POLL_QUESTIONS.map((q) => {
        const t = byId.get(q.id)
        if (!t) return null
        return (
          <Card key={q.id}>
            <p className="font-medium text-white">{de ? q.q.de : q.q.en}</p>
            <p className="mb-3 text-xs text-slate-500">
              {t.answered} {de ? 'haben geantwortet' : 'answered'}
            </p>
            {(t.kind === 'single' || t.kind === 'multi') && (
              <ul className="space-y-2.5">
                {[...t.options].sort((a, b) => b.count - a.count).map((o) => (
                  <Bar key={o.id} label={de ? o.label.de : o.label.en} count={o.count} of={t.answered} />
                ))}
              </ul>
            )}
            {t.kind === 'scale' && (
              <div>
                <p className="mb-2 text-sm text-slate-300">
                  {t.average == null ? '-' : `Ø ${t.average.toFixed(1)} / 5`}
                </p>
                <ul className="space-y-2.5">
                  {t.counts.map((c, i) => (
                    <Bar key={i} label={String(i + 1)} count={c} of={t.answered} />
                  ))}
                </ul>
              </div>
            )}
            {t.kind === 'text' && (
              <ul className="space-y-2">
                {t.texts.length === 0 && <li className="text-sm text-slate-500">-</li>}
                {t.texts.map((x, i) => (
                  <li key={i} className="whitespace-pre-wrap rounded-lg border border-base-700 bg-base-850/40 px-3 py-2 text-sm text-slate-200">
                    {x}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )
      })}
    </div>
  )
}

function Question({ q, value, onChange, de }: { q: PollQuestion; value: PollAnswers[string] | undefined; onChange: (v: PollAnswers[string] | undefined) => void; de: boolean }) {
  const title = de ? q.q.de : q.q.en
  const hint = q.hint ? (de ? q.hint.de : q.hint.en) : null
  const chip = (on: boolean) => `rounded-lg border px-3 py-2 text-left text-sm transition-colors ${on ? 'border-accent bg-accent/15 text-white' : 'border-base-600 bg-base-850/40 text-slate-300 hover:border-base-500'}`
  return (
    <Card>
      <p className="font-medium text-white">{title}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
      <div className="mt-3">
        {q.kind === 'single' && (
          <div className="grid gap-2 sm:grid-cols-2">
            {q.options.map((o) => (
              <button key={o.id} type="button" aria-pressed={value === o.id} onClick={() => onChange(value === o.id ? undefined : o.id)} className={chip(value === o.id)}>
                {de ? o.de : o.en}
              </button>
            ))}
          </div>
        )}
        {q.kind === 'multi' && (
          <div className="grid gap-2 sm:grid-cols-2">
            {q.options.map((o) => {
              const list = Array.isArray(value) ? value : []
              const on = list.includes(o.id)
              return (
                <button key={o.id} type="button" aria-pressed={on} onClick={() => onChange(on ? list.filter((x) => x !== o.id) : [...list, o.id])} className={chip(on)}>
                  {de ? o.de : o.en}
                </button>
              )
            })}
          </div>
        )}
        {q.kind === 'scale' && (
          <div>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" aria-pressed={value === n} onClick={() => onChange(value === n ? undefined : n)} className={`${chip(value === n)} flex-1 text-center font-semibold tabular-nums`}>
                  {n}
                </button>
              ))}
            </div>
            <div className="mt-1 flex justify-between text-[11px] text-slate-500">
              <span>{de ? q.low.de : q.low.en}</span>
              <span>{de ? q.high.de : q.high.en}</span>
            </div>
          </div>
        )}
        {q.kind === 'text' && (
          <div>
            <textarea
              value={typeof value === 'string' ? value : ''}
              onChange={(e) => onChange(e.target.value.slice(0, q.max))}
              rows={3}
              maxLength={q.max}
              className="w-full rounded-lg border border-base-600 bg-base-850/60 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-accent focus:outline-none"
              placeholder={de ? 'Optional' : 'Optional'}
            />
            <p className="mt-0.5 text-right text-[11px] text-slate-600">
              {(typeof value === 'string' ? value : '').length}/{q.max}
            </p>
          </div>
        )}
      </div>
    </Card>
  )
}

export default function Poll() {
  const { language } = useLanguage()
  const de = language === 'de'
  const session = useSession()
  const [state, setState] = useState<PollState | null | undefined>(undefined)
  const [answers, setAnswers] = useState<PollAnswers>({})
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [tab, setTab] = useState<'form' | 'results'>('form')

  useEffect(() => {
    if (session === undefined) return
    if (!session) {
      setState(null)
      return
    }
    let alive = true
    fetchPoll().then((s) => {
      if (!alive) return
      setState(s)
      if (s?.mine) setAnswers(s.mine)
    })
    return () => {
      alive = false
    }
  }, [session])

  const clean = useMemo(() => cleanForSubmit(answers), [answers])
  const count = Object.keys(clean).length

  const save = async () => {
    if (count === 0 || busy) return
    setBusy(true)
    setMsg(null)
    const err = await submitPoll(clean)
    setBusy(false)
    if (!err) setMsg({ ok: true, text: de ? 'Gespeichert, danke! Du kannst deine Antworten jederzeit ändern.' : 'Saved, thank you! You can change your answers any time.' })
    else
      setMsg({
        ok: false,
        text: err === 'members_only' ? (de ? 'Nur registrierte Clan-Mitglieder können teilnehmen.' : 'Only registered clan members can take part.') : de ? 'Konnte nicht gespeichert werden. Bitte später nochmal versuchen.' : 'Could not save. Please try again later.',
      })
  }

  const toggleOpen = async () => {
    if (!state || busy) return
    const next = !state.open
    if (next && !window.confirm(de ? 'Die Umfrage für alle Mitglieder freigeben?' : 'Release the survey to all members?')) return
    setBusy(true)
    const ok = await setPollOpen(next)
    setBusy(false)
    if (ok) setState({ ...state, open: next, visible: true })
  }

  if (state === undefined || session === undefined) return <Spinner />

  const hidden = !state || !state.visible
  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-8 sm:px-0">
      {hidden ? (
        <Card className="text-center">
          <p className="font-display text-lg font-bold text-white">{de ? 'Gerade keine Umfrage' : 'No survey right now'}</p>
          <p className="mt-1 text-sm text-slate-400">
            {!session ? (de ? 'Melde dich an, um teilzunehmen, sobald eine Umfrage läuft.' : 'Sign in to take part when a survey is running.') : de ? 'Sobald eine Umfrage läuft, findest du sie hier.' : 'When a survey is running, you will find it here.'}
          </p>
          <Link to="/" className="btn-ghost mt-3 inline-block text-sm">
            {de ? 'Zur Startseite' : 'Home'}
          </Link>
        </Card>
      ) : (
        <>
          <SectionHeading eyebrow={de ? 'Umfrage' : 'Survey'} title={de ? POLL_TITLE.de : POLL_TITLE.en} />
          {state.admin && (
            <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${state.open ? 'border-signal-green/40 bg-signal-green/10 text-slate-200' : 'border-gold/40 bg-gold/10 text-slate-200'}`}>
              <span>
                {state.open
                  ? de
                    ? 'Für alle Mitglieder freigegeben.'
                    : 'Released to all members.'
                  : de
                    ? 'Vorschau: nur Admins sehen diese Umfrage. Mitglieder sehen sie erst nach der Freigabe.'
                    : 'Preview: only admins see this survey. Members see it after you release it.'}
              </span>
              <button type="button" disabled={busy} onClick={toggleOpen} className="btn-ghost shrink-0 text-xs">
                {state.open ? (de ? 'Wieder verstecken' : 'Hide again') : de ? 'Für alle freigeben' : 'Release to everyone'}
              </button>
            </div>
          )}
          {state.admin && (
            <div className="flex gap-2">
              {(['form', 'results'] as const).map((k) => (
                <button key={k} type="button" onClick={() => setTab(k)} aria-pressed={tab === k} className={`rounded-lg border px-3 py-1.5 text-sm ${tab === k ? 'border-accent bg-accent/15 text-white' : 'border-base-600 text-slate-400 hover:text-white'}`}>
                  {k === 'form' ? (de ? 'Fragebogen' : 'Form') : de ? 'Auswertung' : 'Results'}
                </button>
              ))}
            </div>
          )}
          {tab === 'results' && state.admin ? (
            <Results de={de} />
          ) : (
            <>
              <p className="text-sm text-slate-400">{de ? POLL_INTRO.de : POLL_INTRO.en}</p>
              {!state.member && <p className="rounded-xl border border-base-700 bg-base-850/40 px-4 py-3 text-sm text-slate-400">{de ? 'Du musst als Clan-Mitglied registriert sein, um zu antworten.' : 'You need to be a registered clan member to answer.'}</p>}
              {POLL_QUESTIONS.map((q) => (
                <Question key={q.id} q={q} de={de} value={answers[q.id]} onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v as never }))} />
              ))}
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" onClick={save} disabled={busy || count === 0 || !state.member} className="btn-accent disabled:opacity-50">
                  {busy ? '…' : de ? 'Antworten speichern' : 'Save answers'}
                </button>
                {msg && <span className={`text-sm ${msg.ok ? 'text-signal-green' : 'text-signal-red'}`}>{msg.text}</span>}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
