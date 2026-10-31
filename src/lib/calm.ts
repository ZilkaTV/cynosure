// "Calm": the page is hidden, the window has no focus (somebody plays or streams next to it), or the member switched calm mode on in the settings.
// Decorative animations (index.css, html[data-calm]) and the jobs that only keep the page fresh (per-second counters, background reloads,
// polling) rest then; they catch up when the window gets the focus again.
export const CALM_KEY = 'cyn:calm'
export function isCalm(): boolean {
  try {
    if (localStorage.getItem(CALM_KEY) === '1') return true
  } catch {
    /* blocked storage */
  }
  return document.visibilityState === 'hidden' || !document.hasFocus()
}
