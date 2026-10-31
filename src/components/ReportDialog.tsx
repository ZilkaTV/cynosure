import { useState } from 'react'
import { useLanguage } from '../i18n/LanguageContext'
import { REPORT_REASONS, sendReport, type ReportReason, type ReportTarget } from '../lib/reports'

/** The window to report a profile or a comment: pick a reason, add a few words if you like, send. Admins read it. */
export default function ReportDialog({ myId, target, targetId, subject, onClose }: { myId: string; target: ReportTarget; targetId: string; subject: string; onClose: () => void }) {
  const { language } = useLanguage()
  const de = language === 'de'
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  async function send() {
    if (!reason || busy) return
    setBusy(true)
    const problem = await sendReport(myId, target, targetId, reason, note)
    setBusy(false)
    setResult(problem ? { ok: false, message: problem } : { ok: true, message: de ? 'Danke, die Meldung ist bei den Admins angekommen.' : 'Thanks, the report reached the admins.' })
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose} role="dialog" aria-modal="true" aria-label={de ? 'Melden' : 'Report'}>
      <div className="w-full max-w-md rounded-2xl border border-base-600 bg-base-900 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-display text-lg font-bold text-white">{target === 'profile' ? (de ? 'Profil melden' : 'Report profile') : de ? 'Kommentar melden' : 'Report comment'}</p>
            <p className="mt-0.5 text-sm text-slate-400">{subject}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-slate-400 hover:bg-base-800 hover:text-white" aria-label={de ? 'Schließen' : 'Close'}>
            ✕
          </button>
        </div>
        {result?.ok ? (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-signal-green">{result.message}</p>
            <button type="button" onClick={onClose} className="btn-accent !px-5 !py-1.5 text-sm">
              {de ? 'Schließen' : 'Close'}
            </button>
          </div>
        ) : (
          <>
            <p className="mt-4 text-xs font-semibold uppercase tracking-widest text-slate-500">{de ? 'Worum geht es?' : 'What is it about?'}</p>
            <div className="mt-2 space-y-1.5">
              {REPORT_REASONS.map((r) => (
                <label key={r.key} className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors ${reason === r.key ? 'border-accent bg-accent/15 text-white' : 'border-base-600 bg-base-800/60 text-slate-300 hover:border-base-500'}`}>
                  <input type="radio" name="report-reason" checked={reason === r.key} onChange={() => setReason(r.key)} className="accent-[#8b5cf6]" />
                  {de ? r.de : r.en}
                </label>
              ))}
            </div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 200))}
              rows={2}
              placeholder={de ? 'Optional: ein paar Worte dazu …' : 'Optional: a few words about it …'}
              className="mt-3 w-full rounded-lg border border-base-600 bg-base-800 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-accent focus:outline-none"
            />
            {result && <p className="mt-2 text-xs text-signal-red">{result.message}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={onClose} className="btn-ghost text-sm">
                {de ? 'Abbrechen' : 'Cancel'}
              </button>
              <button type="button" onClick={() => void send()} disabled={!reason || busy} className="btn-accent !px-5 !py-1.5 text-sm disabled:opacity-50">
                {busy ? '…' : de ? 'Melden' : 'Report'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
