// Helpers for entering and showing game night times. A game night is stored as
// one absolute moment (UTC); every viewer sees it in their own local time zone,
// so "20:00" entered by someone in Berlin reads as 19:00 for someone in London.

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
  const map: Record<string, string> = { de: 'de-DE', fr: 'fr-FR', ru: 'ru-RU', it: 'it-IT', es: 'es-ES', ko: 'ko-KR' }
  return map[language] ?? 'en-GB'
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
