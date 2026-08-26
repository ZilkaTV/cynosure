// ── Last-known-good roster snapshot (IndexedDB) ─────────────────────────────
// Lets the roster table render INSTANTLY on every visit from whatever was
// last successfully built, instead of blocking behind a spinner while
// useRoster's pipeline re-runs. That pipeline no longer touches
// OpenFront/trackerfront live (see openfront.ts) but is still several
// parallel Supabase queries plus non-trivial client-side computation - a
// returning visitor shouldn't have to wait through that just to see numbers
// that were correct a few minutes ago. IndexedDB, not localStorage - a full
// roster snapshot (every member's entire CYN game history + game-detail
// lookups) can run well past localStorage's ~5-10MB per-origin quota.

import type { RosterResult } from './stats'

const IDB_NAME = 'cyn-roster-cache'
const IDB_STORE = 'snapshot'
const KEY = 'latest'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function loadPersistedRoster(): Promise<RosterResult | null> {
  try {
    const db = await openDb()
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly')
      const req = tx.objectStore(IDB_STORE).get(KEY)
      req.onsuccess = () => resolve((req.result as RosterResult | undefined) ?? null)
      req.onerror = () => reject(req.error)
    })
  } catch {
    return null
  }
}

export async function savePersistedRoster(data: RosterResult): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite')
      tx.objectStore(IDB_STORE).put(data, KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    /* quota / private mode - just rebuilds fresh next time */
  }
}
