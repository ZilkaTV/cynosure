import { useEffect, useRef } from 'react'

// Page usage for the admin Metrics page: which pages a signed-in member opens and how long each stays in the foreground.
// Reports are batched (at most one every 30 s, plus a heartbeat every 2 minutes while the tab is visible and a last one when it is
// hidden or closed), so a member costs the database only a handful of small writes per visit. See worker/sitePages.js.

const HEARTBEAT_MS = 120_000
const MIN_GAP_MS = 30_000
const SETTLE_MS = 10_000

/** "/member/AbCd1234" -> "/member/:id"; at most two segments, so the list stays short and holds no ids. */
export function normalizePath(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean).slice(0, 2)
  if (parts.length === 0) return '/'
  const clean = parts.map((p, i) => (i > 0 && /^[A-Za-z0-9_-]{8,}$/.test(p) && (/\d/.test(p) || (/[a-z]/.test(p) && /[A-Z]/.test(p))) ? ':id' : p.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32)))
  return '/' + clean.join('/')
}

export function usePageTracker(pathname: string, enabled: boolean) {
  const state = useRef({
    path: '',
    lastTick: 0,
    lastSent: 0,
    pending: new Map<string, { v: number; s: number }>(),
    settle: 0 as ReturnType<typeof setTimeout> | 0,
  })

  // a page change: close the time of the page before, count one view of the new one
  useEffect(() => {
    if (!enabled) return
    const st = state.current
    const now = Date.now()
    accrue(st, now)
    st.path = normalizePath(pathname)
    st.lastTick = document.visibilityState === 'visible' ? now : 0
    const entry = st.pending.get(st.path) ?? { v: 0, s: 0 }
    entry.v += 1
    st.pending.set(st.path, entry)
    if (st.settle) clearTimeout(st.settle)
    st.settle = setTimeout(() => flush(st, false), Math.max(SETTLE_MS, MIN_GAP_MS - (now - st.lastSent)))
  }, [pathname, enabled])

  useEffect(() => {
    if (!enabled) return
    const st = state.current
    const beat = setInterval(() => {
      if (document.visibilityState === 'visible') flush(st, false)
    }, HEARTBEAT_MS)
    const onVisibility = () => {
      const now = Date.now()
      if (document.visibilityState === 'hidden') flush(st, true)
      else st.lastTick = now
    }
    const onHide = () => flush(st, true)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onHide)
    return () => {
      clearInterval(beat)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onHide)
    }
  }, [enabled])
}

type St = { path: string; lastTick: number; lastSent: number; pending: Map<string, { v: number; s: number }>; settle: ReturnType<typeof setTimeout> | 0 }

/** Adds the visible time since the last tick to the current page. */
function accrue(st: St, now: number) {
  if (!st.path || !st.lastTick) return
  const seconds = Math.min(300, Math.max(0, (now - st.lastTick) / 1000))
  const entry = st.pending.get(st.path) ?? { v: 0, s: 0 }
  entry.s += seconds
  st.pending.set(st.path, entry)
  st.lastTick = now
}

function flush(st: St, leaving: boolean) {
  const now = Date.now()
  if (st.settle) {
    clearTimeout(st.settle)
    st.settle = 0
  }
  accrue(st, now)
  if (document.visibilityState !== 'visible') st.lastTick = 0
  const pages: Record<string, { v: number; s: number }> = {}
  for (const [path, a] of st.pending) if (a.v || a.s >= 1) pages[path] = { v: a.v, s: Math.round(a.s) }
  const open = !leaving && document.visibilityState === 'visible' ? st.path : null
  if (Object.keys(pages).length === 0 && !leaving) {
    // nothing new to add, but the heartbeat still tells "this page is open"
    if (!open) return
  }
  st.pending.clear()
  st.lastSent = now
  try {
    void fetch('/api/seen/pages', { method: 'POST', credentials: 'same-origin', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pages, open }) }).catch(() => {})
  } catch {
    /* blocked - skip */
  }
}
