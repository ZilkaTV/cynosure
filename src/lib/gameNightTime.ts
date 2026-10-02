// Helpers for entering and showing game night times. A game night is stored as
// one absolute moment (UTC); every viewer sees it in their own local time zone,
// so "20:00" entered by someone in Berlin reads as 19:00 for someone in London.

const pad = (n: number) => String(n).padStart(2, '0')

/** Value for <input type="datetime-local"> in the browser's local time zone. */
export function toLocalInputValue(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export interface TimePreset {
  kind: 'today' | 'tomorrow'
  time: string // HH:MM
  value: string // datetime-local value
}

/** Quick picks: tonight's remaining evening slots plus tomorrow 20:00. Past slots are never offered. */
export function timePresets(now = new Date()): TimePreset[] {
  const out: TimePreset[] = []
  for (const hour of [18, 19, 20, 21, 22]) {
    const d = new Date(now)
    d.setHours(hour, 0, 0, 0)
    if (d.getTime() > now.getTime() + 5 * 60_000) out.push({ kind: 'today', time: `${pad(hour)}:00`, value: toLocalInputValue(d) })
  }
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(20, 0, 0, 0)
  out.push({ kind: 'tomorrow', time: '20:00', value: toLocalInputValue(tomorrow) })
  return out
}

/** "2h 10m", "35m", "1d 3h" - time from now until `startsAt` (empty if already past). */
export function relativeUntil(startsAt: string, now = Date.now()): string {
  const diffMin = Math.floor((new Date(startsAt).getTime() - now) / 60_000)
  if (diffMin <= 0) return ''
  const d = Math.floor(diffMin / 1440)
  const h = Math.floor((diffMin % 1440) / 60)
  const m = diffMin % 60
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export function localeFor(language: string): string {
  return language === 'de' ? 'de-DE' : language === 'fr' ? 'fr-FR' : 'en-GB'
}

/** Full local date + time with the viewer's own zone abbreviation (e.g. "Fri 3 Oct, 19:00 BST"). */
export function formatLocal(startsAt: string, language: string): string {
  return new Date(startsAt).toLocaleString(localeFor(language), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  })
}

export function formatUtc(startsAt: string, language: string): string {
  return new Date(startsAt).toLocaleString(localeFor(language), { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC'
}
