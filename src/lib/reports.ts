import { supabase as db } from './supabase'

// Reports of a profile (picture, text) or of a comment on a profile wall. Members send them, admins read and close them
// (table cyn_reports, rules in worker/dbApi.js).

export type ReportReason = 'image' | 'insult' | 'spam' | 'impersonation' | 'other'
export type ReportTarget = 'profile' | 'comment'

export const REPORT_REASONS: { key: ReportReason; de: string; en: string }[] = [
  { key: 'image', de: 'Anstößiges Bild (Icon oder Banner)', en: 'Offensive picture (icon or banner)' },
  { key: 'insult', de: 'Beleidigung, Hetze oder Drohung', en: 'Insults, hate or threats' },
  { key: 'spam', de: 'Spam oder Werbung', en: 'Spam or advertising' },
  { key: 'impersonation', de: 'Gibt sich als jemand anderes aus', en: 'Pretends to be somebody else' },
  { key: 'other', de: 'Etwas anderes', en: 'Something else' },
]
export const reasonLabel = (reason: string, de: boolean) => {
  const r = REPORT_REASONS.find((x) => x.key === reason)
  return r ? (de ? r.de : r.en) : reason
}

export interface Report {
  id: number
  reporter_openfront_id: string
  target_type: ReportTarget
  target_id: string
  reason: ReportReason
  note: string | null
  status: 'open' | 'done'
  created_at: string
  handled_by: string | null
  handled_at: string | null
}

/** Sends a report; null when it went through, otherwise what is wrong. */
export async function sendReport(myId: string, target: ReportTarget, targetId: string, reason: ReportReason, note: string): Promise<string | null> {
  const { error } = await db.from('cyn_reports').insert({ reporter_openfront_id: myId, target_type: target, target_id: targetId, reason, note: note.trim() || null })
  if (!error) return null
  if (error.code === '42501') return 'Your session expired. Sign out and back in with Discord, then try again.'
  return error.message.replace(/^[a-z_]+: /, '')
}

/** The open reports (admins only; everybody else gets an error and so an empty list). */
export async function fetchOpenReports(limit = 100): Promise<Report[]> {
  const { data, error } = await db.from('cyn_reports').select('*').eq('status', 'open').order('created_at', { ascending: false }).limit(limit)
  if (error || !data) return []
  return data as Report[]
}

export async function closeReport(id: number, adminId: string): Promise<boolean> {
  const { error } = await db.from('cyn_reports').update({ status: 'done', handled_by: adminId, handled_at: new Date().toISOString() }).eq('id', id)
  return !error
}
